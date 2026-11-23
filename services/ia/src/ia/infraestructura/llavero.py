"""Credenciales en el llavero del sistema operativo (en macOS, Keychain) con `keyring` (ADR 0010)."""

import contextlib

import keyring
from keyring.errors import PasswordDeleteError

from ia.aplicacion.puertos import TipoDeCredencial

SERVICIO = "brecha"


class Llavero:
    def obtener(self, tipo: TipoDeCredencial) -> str | None:
        valor = keyring.get_password(SERVICIO, tipo.value)
        return valor or None

    def guardar(self, tipo: TipoDeCredencial, valor: str) -> None:
        if not valor.strip():
            raise ValueError("El valor está vacío")
        keyring.set_password(SERVICIO, tipo.value, valor.strip())

    def borrar(self, tipo: TipoDeCredencial) -> None:
        with contextlib.suppress(PasswordDeleteError):
            keyring.delete_password(SERVICIO, tipo.value)
