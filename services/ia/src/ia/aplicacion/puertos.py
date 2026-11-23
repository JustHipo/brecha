"""Puertos del servicio con IA (ADR 0016). Las implementaciones viven en `infraestructura`."""

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol


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
