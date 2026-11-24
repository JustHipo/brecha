"""Adaptador de OpenAI (ADR 0016, D26): salida estructurada con esquema estricto y errores tipados."""

import time
from typing import Literal

import openai
from openai import OpenAI
from pydantic import BaseModel, Field

from ia.aplicacion.puertos import ErrorDeModelo, Uso
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


class ModeloOpenAI:
    def __init__(self, llave: str, modelo: str, cliente: OpenAI | None = None) -> None:
        self.modelo = modelo
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
