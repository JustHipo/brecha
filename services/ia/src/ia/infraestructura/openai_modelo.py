"""Adaptador de OpenAI (ADR 0016, D26): salida estructurada con esquema estricto y errores tipados."""

import time
from typing import Any, Literal

import openai
from openai import OpenAI
from pydantic import BaseModel, Field

from ia.aplicacion.puertos import AvisoParaResponder, ErrorDeModelo, Uso
from ia.dominio.aviso import Aviso
from ia.dominio.calce import Requisito
from ia.dominio.clasificacion import Clasificacion, ClasificacionInvalida

PROMPT = """Eres el clasificador de correos de Brecha, una app que sigue las postulaciones
de empleo de una persona.
Recibes un correo que ya pasó un filtro (remitente o palabras de reclutamiento). Responde SIEMPRE en español.

Decide:
- es_postulacion: true solo si el correo trata de una postulación o proceso de selección de esta persona
  (confirmación de postulación, revisión, prueba, entrevista, oferta o rechazo). Publicidad, boletines,
  compras, alertas de empleos nuevos o mensajes de reclutadores sin un proceso en curso: false.
- estado_sugerido (solo si es_postulacion):
  postulado = confirma que la postulación se envió o se recibió;
  en_proceso = la revisan, pasó de etapa, le piden una prueba o completar algo;
  entrevista = la invitan a una entrevista o le piden agendarla;
  oferta = le hacen una oferta;
  rechazado = no sigue en el proceso;
  ninguno = es de una postulación pero no cambia su estado (por ejemplo, «tu postulación fue vista»).
- empresa y cargo: tal como aparecen; null si no se sabe. Si escribe una consultora o plataforma
  por otra empresa, la empresa es la que contrata.
- plataforma: por donde llegó (linkedin, trabajando, getonboard, computrabajo, chiletrabajos, indeed,
  sitio_empresa para sistemas de selección de la empresa, otra).
- resumen: una línea en español, máximo 140 caracteres, sin datos personales del destinatario.
- confianza (0 a 1): qué tan seguro es el estado_sugerido. Usa 0,9 o más SOLO si el correo dice el resultado
  de forma explícita (por ejemplo «no continuaremos con tu postulación»). Si hay que interpretar, 0,7 o menos.
"""


class _Salida(BaseModel):
    es_postulacion: bool
    plataforma: Literal[
        "linkedin",
        "trabajando",
        "getonboard",
        "computrabajo",
        "chiletrabajos",
        "indeed",
        "sitio_empresa",
        "otra",
    ]
    empresa: str | None
    cargo: str | None
    estado_sugerido: Literal["postulado", "en_proceso", "entrevista", "oferta", "rechazado", "ninguno"]
    resumen: str = Field(max_length=200)
    confianza: float = Field(ge=0, le=1)


def _tipo_de_error(e: Exception) -> str:
    if isinstance(e, openai.RateLimitError):
        codigo = getattr(e, "code", None)
        return "cuota" if codigo == "insufficient_quota" or "insufficient_quota" in str(e) else "limite"
    if isinstance(e, openai.AuthenticationError | openai.PermissionDeniedError):
        return "credencial"
    if isinstance(e, openai.APIConnectionError | openai.APITimeoutError | openai.InternalServerError):
        return "no_disponible"
    return "respuesta_invalida"


PROMPT_AVISO = """Extraes los requisitos de un aviso de empleo para Brecha. Responde en español.
- requisitos: cada herramienta, lenguaje, framework, plataforma o práctica técnica que pide el aviso
  (por ejemplo «Python», «NestJS», «PostgreSQL», «Docker», «AWS», «CI/CD», «inglés»).
  Usa el nombre corto y conocido, sin versiones. No incluyas habilidades blandas ni títulos universitarios.
- obligatorio: true si el aviso lo exige; false si dice deseable, «plus», «valorable»,
  «nice to have» u opcional.
- anos: años de experiencia que pide para ESA herramienta, solo si lo dice; si no, null.
- anos_totales: años de experiencia general que pide el aviso, o null.
No inventes requisitos que el aviso no menciona. Máximo 25.
"""

PROMPT_PREGUNTA = """Respondes preguntas sobre los avisos de empleo que la persona guardó en Brecha.
Responde en español, breve y concreto, usando SOLO los avisos que se te entregan (cada uno con su id).
- citados: los ids de los avisos en los que se basa tu respuesta. Solo ids de la lista.
- Si ningún aviso responde la pregunta, dilo con claridad y deja citados vacío. No inventes avisos ni datos.
- Nombra los avisos por cargo y empresa; no muestres los ids en el texto.
- Cada aviso puede traer «Calce» (0 a 100 %) y «Brechas» con el perfil de la persona, calculados por Brecha.
  Si preguntan por calce o por lo que les falta, usa esos valores tal cual; no los recalcules ni los inventes.
"""


class _Requisito(BaseModel):
    nombre: str = Field(max_length=80)
    obligatorio: bool
    anos: int | None = Field(ge=0, le=30)


class _Analisis(BaseModel):
    requisitos: list[_Requisito] = Field(max_length=25)
    anos_totales: int | None = Field(ge=0, le=40)


class _Respuesta(BaseModel):
    respuesta: str = Field(max_length=2500)
    citados: list[str] = Field(max_length=8)


class ModeloOpenAI:
    def __init__(
        self,
        llave: str,
        modelo: str,
        cliente: OpenAI | None = None,
        modelo_embeddings: str = "text-embedding-3-small",
    ) -> None:
        self.modelo = modelo
        self.modelo_embeddings = modelo_embeddings
        self.cliente = cliente or OpenAI(api_key=llave, timeout=60, max_retries=1)

    def clasificar_correo(
        self, remitente: str, asunto: str, fragmento: str, plataforma_detectada: str | None
    ) -> tuple[Clasificacion, Uso]:
        dominio = remitente.rsplit("@", 1)[-1]
        mensaje = (
            f"Dominio del remitente: {dominio}\n"
            f"Plataforma detectada por el filtro: {plataforma_detectada or 'ninguna'}\n"
            f"Asunto: {asunto}\n\n{fragmento}"
        )
        inicio = time.monotonic()
        try:
            r = self.cliente.chat.completions.parse(
                model=self.modelo,
                messages=[{"role": "system", "content": PROMPT}, {"role": "user", "content": mensaje}],
                response_format=_Salida,
            )
        except openai.OpenAIError as e:
            raise ErrorDeModelo(_tipo_de_error(e), str(e)[:300]) from e
        salida = r.choices[0].message.parsed
        if salida is None:
            raise ErrorDeModelo("respuesta_invalida", "el modelo no devolvió el esquema")
        try:
            clasif = Clasificacion(
                es_postulacion=salida.es_postulacion,
                plataforma=salida.plataforma,
                empresa=(salida.empresa or None),
                cargo=(salida.cargo or None),
                estado_sugerido=None
                if not salida.es_postulacion or salida.estado_sugerido == "ninguno"
                else salida.estado_sugerido,
                resumen=salida.resumen[:140],
                confianza=salida.confianza,
            )
        except ClasificacionInvalida as e:
            raise ErrorDeModelo("respuesta_invalida", str(e)) from e
        uso = r.usage
        return clasif, Uso(
            modelo=r.model,
            tokens_entrada=uso.prompt_tokens if uso else 0,
            tokens_salida=uso.completion_tokens if uso else 0,
            duracion_ms=int((time.monotonic() - inicio) * 1000),
        )

    def _parse(self, sistema: str, mensaje: str, formato: type[BaseModel]) -> tuple[Any, Uso]:
        inicio = time.monotonic()
        try:
            r = self.cliente.chat.completions.parse(
                model=self.modelo,
                messages=[{"role": "system", "content": sistema}, {"role": "user", "content": mensaje}],
                response_format=formato,
            )
        except openai.OpenAIError as e:
            raise ErrorDeModelo(_tipo_de_error(e), str(e)[:300]) from e
        salida = r.choices[0].message.parsed
        if salida is None:
            raise ErrorDeModelo("respuesta_invalida", "el modelo no devolvió el esquema")
        uso = r.usage
        return salida, Uso(
            modelo=r.model,
            tokens_entrada=uso.prompt_tokens if uso else 0,
            tokens_salida=uso.completion_tokens if uso else 0,
            duracion_ms=int((time.monotonic() - inicio) * 1000),
        )

    def analizar_aviso(self, aviso: Aviso) -> tuple[list[Requisito], Uso]:
        mensaje = (
            f"Cargo: {aviso.titulo}\nEmpresa: {aviso.empresa}\n"
            f"Herramientas listadas por la fuente: {', '.join(aviso.stack) or 'ninguna'}\n\n"
            f"{aviso.texto[:8000]}"
        )
        salida, uso = self._parse(PROMPT_AVISO, mensaje, _Analisis)
        return [
            Requisito(r.nombre.strip(), r.obligatorio, r.anos) for r in salida.requisitos if r.nombre.strip()
        ], uso

    def embeber(self, textos: list[str]) -> tuple[list[list[float]], Uso]:
        inicio = time.monotonic()
        try:
            r = self.cliente.embeddings.create(model=self.modelo_embeddings, input=textos)
        except openai.OpenAIError as e:
            raise ErrorDeModelo(_tipo_de_error(e), str(e)[:300]) from e
        vectores = [d.embedding for d in sorted(r.data, key=lambda d: d.index)]
        return vectores, Uso(r.model, r.usage.prompt_tokens, 0, int((time.monotonic() - inicio) * 1000))

    def responder(self, pregunta: str, avisos: list[AvisoParaResponder]) -> tuple[str, list[str], Uso]:
        bloques = [
            f"[id: {a.id}] {a.titulo} · {a.empresa} · {a.modalidad}"
            f"{' · ' + a.sueldo if a.sueldo else ''}\n"
            f"Herramientas: {', '.join(a.stack) or 'no indica'}\n"
            f"Calce: {f'{a.calce} %' if a.calce is not None else 'sin calcular'}"
            f"{' · Brechas: ' + ', '.join(a.brechas) if a.brechas else ''}\n{a.texto}"
            for a in avisos
        ]
        mensaje = f"Pregunta: {pregunta}\n\nAvisos:\n\n" + "\n\n---\n\n".join(bloques)
        salida, uso = self._parse(PROMPT_PREGUNTA, mensaje, _Respuesta)
        return salida.respuesta, list(salida.citados), uso
