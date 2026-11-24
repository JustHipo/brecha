"""Puertos del servicio con IA (ADR 0016). Las implementaciones viven en `infraestructura`."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Protocol

from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.clasificacion import Clasificacion
from ia.dominio.correo import CorreoLeido, EstadoDeCorreo


class TipoDeCredencial(StrEnum):
    CORREO_USUARIO = "correo-usuario"
    CORREO_CLAVE = "correo-clave-de-aplicacion"
    OPENAI = "openai-llave"


@dataclass(frozen=True)
class EstadoDeCredenciales:
    correo: bool
    openai: bool

    def faltantes(self) -> list[str]:
        falta = []
        if not self.correo:
            falta.append("correo (uv run ia credenciales correo)")
        if not self.openai:
            falta.append("OpenAI (uv run ia credenciales openai)")
        return falta


class Credenciales(Protocol):
    """Secretos del usuario. Nunca se imprimen ni se guardan en la base (IAAPP-002)."""

    def obtener(self, tipo: TipoDeCredencial) -> str | None: ...
    def guardar(self, tipo: TipoDeCredencial, valor: str) -> None: ...
    def borrar(self, tipo: TipoDeCredencial) -> None: ...


def estado_de(credenciales: Credenciales) -> EstadoDeCredenciales:
    return EstadoDeCredenciales(
        correo=bool(credenciales.obtener(TipoDeCredencial.CORREO_USUARIO))
        and bool(credenciales.obtener(TipoDeCredencial.CORREO_CLAVE)),
        openai=bool(credenciales.obtener(TipoDeCredencial.OPENAI)),
    )


# ── Correo (F2-05) ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PuntoDeLectura:
    """Dónde quedó el vigía: los UID solo valen mientras no cambie el `uidvalidity` de la carpeta."""

    uidvalidity: int | None
    ultimo_uid: int | None


class LectorDeCorreo(Protocol):
    """Fuente de correo de solo lectura (D25). Nunca marca nada como leído."""

    def uidvalidity(self) -> int: ...
    def nuevos(self, desde_uid: int | None, desde_fecha: date) -> Iterable[CorreoLeido]: ...


@dataclass(frozen=True)
class CorreoGuardado:
    message_id: str
    uid: int
    remitente: str
    recibido_en: datetime
    estado: EstadoDeCorreo
    plataforma: str | None
    motivo: str
    asunto: str | None = None  # solo si pasó el filtro
    fragmento: str | None = None  # solo si pasó el filtro


class RepositorioDeCorreos(Protocol):
    def punto_de_lectura(self) -> PuntoDeLectura: ...
    def existe(self, message_id: str) -> bool: ...
    def guardar(self, correo: CorreoGuardado) -> None: ...
    def registrar_revision(self, punto: PuntoDeLectura, cuando: datetime, error: str | None) -> None: ...
    def en_cola(self) -> int: ...


# ── Modelo de lenguaje y trazas (F2-06, ADR 0016) ──────────────────────────────


class ErrorDeModelo(Exception):
    """Error tipado del proveedor (IAAPP-006). `tipo` decide si se sigue con el próximo correo o se para."""

    def __init__(self, tipo: str, mensaje: str) -> None:
        super().__init__(mensaje)
        self.tipo = tipo  # cuota | limite | credencial | no_disponible | respuesta_invalida

    @property
    def detiene(self) -> bool:
        return self.tipo in {"cuota", "limite", "credencial", "no_disponible"}


@dataclass(frozen=True)
class Uso:
    modelo: str
    tokens_entrada: int
    tokens_salida: int
    duracion_ms: int


class ModeloDeLenguaje(Protocol):
    def clasificar_correo(
        self, remitente: str, asunto: str, fragmento: str, plataforma_detectada: str | None
    ) -> tuple[Clasificacion, Uso]: ...


@dataclass(frozen=True)
class Traza:
    caso: str
    modelo: str
    tokens_entrada: int
    tokens_salida: int
    costo_usd: float
    duracion_ms: int
    resultado: str  # ok | cuota | limite | credencial | no_disponible | respuesta_invalida
    creada_en: datetime


class RegistroDeTrazas(Protocol):
    def registrar(self, traza: Traza) -> None: ...


@dataclass(frozen=True)
class CorreoPorClasificar:
    message_id: str
    remitente: str
    asunto: str
    fragmento: str
    plataforma: str | None
    intentos: int


class ColaDeClasificacion(Protocol):
    def pendientes(self, limite: int) -> list[CorreoPorClasificar]: ...
    def marcar_clasificado(self, message_id: str, clasificacion: Clasificacion, modelo: str) -> None: ...
    def marcar_intento_fallido(self, message_id: str, maximo: int) -> None: ...
    def registrar_error_ia(self, error: str | None) -> None: ...


# ── Núcleo y registro de señales (F2-07, backend.md C3) ────────────────────────


class NucleoNoDisponible(Exception):
    """El núcleo no respondió: las señales esperan a la próxima vuelta."""


@dataclass(frozen=True)
class SenalParaNucleo:
    referencia_externa: str  # Message-ID: el núcleo no la duplica
    postulacion_id: str | None  # None: va a la bandeja
    plataforma: str
    resumen: str
    estado_sugerido: str | None
    confianza: float
    recibida_en: datetime
    remitente: str
    asunto: str
    empresa: str | None
    cargo: str | None


@dataclass(frozen=True)
class RespuestaDelNucleo:
    destino: str  # postulacion | bandeja | repetida
    aplicada: bool
    estado: str | None


class Nucleo(Protocol):
    def postulaciones(self) -> list[PostulacionConocida]: ...
    def registrar_senal(self, senal: SenalParaNucleo) -> RespuestaDelNucleo: ...


@dataclass(frozen=True)
class ClasificadoPorEnviar:
    message_id: str
    clasificacion: Clasificacion
    remitente: str
    asunto: str
    recibido_en: datetime


class ColaDeEnvio(Protocol):
    def por_enviar(self, limite: int) -> list[ClasificadoPorEnviar]: ...
    def marcar_enviado(self, message_id: str, postulacion_id: str | None) -> None: ...
