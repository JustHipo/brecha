"""Adaptador de OpenAI (ADR 0016, D26): salida estructurada con esquema estricto y errores tipados."""

import re
import time
from typing import Any, Literal

import openai
from openai import OpenAI
from pydantic import BaseModel, Field

from ia.aplicacion.puertos import AvisoParaResponder, ErrorDeModelo, Uso
from ia.dominio.arriendo import ClasificacionArriendo, PropuestaDePropiedad
from ia.dominio.arriendo import ClasificacionInvalida as ClasificacionInvalidaArriendo
from ia.dominio.aviso import Aviso
from ia.dominio.calce import Requisito
from ia.dominio.clasificacion import Clasificacion, ClasificacionInvalida, PasoCumplido, PasoDetectado
from ia.dominio.pasos import CandidataParaModelo
from ia.dominio.whatsapp import enmascarar
from ia.infraestructura import openai_arriendos as arr

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


PROMPT_CONTEXTO = """
Además te paso las candidatas: postulaciones de la persona que podrían ser de este correo, con su estado,
sus pasos pendientes (s1, s2…), los pasos ya hechos o descartados y sus últimos correos. Decide también:
- postulaciones: los ids (p1, p2…) de las candidatas a las que corresponde el correo. Puede ser más de una
  (la misma empresa por varios cargos) o ninguna. Solo ids de la lista; si ninguna calza, lista vacía.
- paso: si el correo le pide a la persona hacer algo concreto para avanzar en el proceso (completar un test o
  una prueba, llenar un formulario, agendar una llamada o una entrevista, enviar el CV o documentos,
  responder un mensaje, confirmar asistencia), descríbelo; si no pide nada concreto, null.
  descripcion: corta y accionable, máximo 80 caracteres, empieza con un verbo
  («Completar el test de personalidad»).
  detalle: qué piden exactamente y cómo, en una o dos frases.
  plazo: la fecha límite AAAA-MM-DD si el correo la dice (para «en 3 días» usa la fecha de hoy que te
  doy); si no, null.
  enlace: el número N de «[enlace N]» donde se hace el paso, si aparece; si no, null.
  mismo_que: si solo recuerda un paso pendiente que ya aparece en una candidata, su id (s1…); si no, null.
  NO son pasos: «completa tu perfil para destacar», alertas de empleos, boletines, encuestas, ni avisos de que
  la postulación fue vista.
- pasos_cumplidos: ids de pasos pendientes (s1…) que este correo da por hechos («recibimos tu test», «gracias
  por completar la evaluación»), con tu confianza de 0 a 1. Usa 0,9 o más solo si lo dice de forma explícita.
- Usa los pasos hechos y los correos anteriores como contexto: un recordatorio de algo que la persona ya hizo
  no es un paso nuevo, y un paso hecho ayuda a entender en qué etapa va el proceso.
"""


class _Paso(BaseModel):
    descripcion: str = Field(max_length=120)
    detalle: str | None
    plazo: str | None
    enlace: int | None
    mismo_que: str | None


class _Cumplido(BaseModel):
    id: str
    confianza: float = Field(ge=0, le=1)


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


class _SalidaConContexto(_Salida):
    postulaciones: list[str]
    paso: _Paso | None
    pasos_cumplidos: list[_Cumplido]


_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _paso_de(p: _Paso | None) -> PasoDetectado | None:
    if p is None or len(p.descripcion.strip()) < 3:
        return None
    return PasoDetectado(
        descripcion=p.descripcion.strip()[:120],
        detalle=(p.detalle or "").strip()[:2000] or None,
        plazo=p.plazo if p.plazo and _FECHA.match(p.plazo) else None,
        enlace=p.enlace,
        mismo_que=p.mismo_que or None,
    )


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
        self,
        remitente: str,
        asunto: str,
        fragmento: str,
        plataforma_detectada: str | None,
        candidatas: list[CandidataParaModelo] | None = None,
        hoy: str | None = None,
    ) -> tuple[Clasificacion, Uso]:
        dominio = remitente.rsplit("@", 1)[-1]
        mensaje = (
            f"Dominio del remitente: {dominio}\n"
            f"Plataforma detectada por el filtro: {plataforma_detectada or 'ninguna'}\n"
            f"Asunto: {asunto}\n\n{fragmento}"
        )
        con_contexto = candidatas is not None
        if con_contexto:
            lista = "\n\n".join(c.texto(hoy or "") for c in candidatas or []) or "ninguna"
            mensaje += f"\n\n---\nHoy es {hoy or 'desconocido'}.\nCandidatas:\n{lista}"
        inicio = time.monotonic()
        formato: type[_Salida] = _SalidaConContexto if con_contexto else _Salida
        try:
            r = self.cliente.chat.completions.parse(
                model=self.modelo,
                messages=[
                    {"role": "system", "content": PROMPT + (PROMPT_CONTEXTO if con_contexto else "")},
                    {"role": "user", "content": mensaje},
                ],
                response_format=formato,
            )
        except openai.OpenAIError as e:
            raise ErrorDeModelo(_tipo_de_error(e), str(e)[:300]) from e
        salida = r.choices[0].message.parsed
        if salida is None:
            raise ErrorDeModelo("respuesta_invalida", "el modelo no devolvió el esquema")
        extra: dict[str, Any] = {}
        if isinstance(salida, _SalidaConContexto):
            extra = {
                "postulaciones": tuple(dict.fromkeys(x.strip() for x in salida.postulaciones if x.strip())),
                "paso": _paso_de(salida.paso) if salida.es_postulacion else None,
                "pasos_cumplidos": tuple(PasoCumplido(x.id, x.confianza) for x in salida.pasos_cumplidos),
            }
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
                **extra,
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

    # ── Arriendos (docs/diseno/arriendos.md §7) ─────────────────────────────────

    def clasificar_arriendo(
        self, remitente: str, asunto: str, fragmento: str
    ) -> tuple[ClasificacionArriendo, Uso]:
        dominio = remitente.rsplit("@", 1)[-1]
        texto, _ = enmascarar(f"Dominio del remitente: {dominio}\nAsunto: {asunto}\n\n{fragmento}")
        salida, uso = self._parse(arr.PROMPT_CORREO, texto, arr._Correo)
        try:
            return arr.a_clasificacion(salida), uso
        except ClasificacionInvalidaArriendo as e:
            raise ErrorDeModelo("respuesta_invalida", str(e)) from e

    def extraer_arriendos(self, texto: str, es_chat: bool) -> tuple[list[PropuestaDePropiedad], Uso]:
        encabezado = "Chat de WhatsApp:" if es_chat else "Texto:"
        salida, uso = self._parse(arr.PROMPT_EXTRAER, f"{encabezado}\n\n{texto}", arr._Extraccion)
        try:
            return [arr.a_propuesta(p) for p in salida.propiedades], uso
        except ClasificacionInvalidaArriendo as e:
            raise ErrorDeModelo("respuesta_invalida", str(e)) from e

    def responder_arriendos(
        self, pregunta: str, propiedades: list[dict[str, object]]
    ) -> tuple[str, list[str], Uso]:
        bloques = "\n\n".join(arr.bloque_de_propiedad(p) for p in propiedades[:80])
        salida, uso = self._parse(
            arr.PROMPT_PREGUNTA, f"Pregunta: {pregunta}\n\nPropiedades:\n\n{bloques}", arr._Respuesta
        )
        return salida.respuesta, list(salida.citados), uso
