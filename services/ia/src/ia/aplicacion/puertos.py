"""Puertos del servicio con IA (ADR 0016). Las implementaciones viven en `infraestructura`."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Protocol

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
