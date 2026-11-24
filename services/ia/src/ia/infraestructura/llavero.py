"""Credenciales en el llavero del sistema operativo con `keyring` (ADR 0010).

macOS: Keychain. Windows: Administrador de credenciales (credenciales genéricas, una por tipo).
"""

import contextlib
import os

import keyring
from keyring.errors import PasswordDeleteError

from ia.aplicacion.puertos import TipoDeCredencial

SERVICIO = "brecha"


def servicio() -> str:
    """La app instalada usa su propia entrada (BRECHA_LLAVERO=brecha-app…).

    En macOS así la app es dueña de esa entrada y no le pide permiso para leerla; en Windows es fija.
    """
    return os.environ.get("BRECHA_LLAVERO") or SERVICIO


class Llavero:
    def obtener(self, tipo: TipoDeCredencial) -> str | None:
        valor = keyring.get_password(servicio(), tipo.value)
        return valor or None

    def guardar(self, tipo: TipoDeCredencial, valor: str) -> None:
        if not valor.strip():
            raise ValueError("El valor está vacío")
        keyring.set_password(servicio(), tipo.value, valor.strip())

    def borrar(self, tipo: TipoDeCredencial) -> None:
        with contextlib.suppress(PasswordDeleteError):
            keyring.delete_password(servicio(), tipo.value)


def migrar_desde(anterior: str, destino: Llavero | None = None) -> list[TipoDeCredencial]:
    """Copia a la entrada actual lo que falta y está en la entrada `anterior` (una actualización de la app).

    En macOS leer la entrada anterior desde un binario nuevo puede pedir permiso una vez por credencial.
    Nunca imprime ni devuelve valores: solo qué tipos copió.
    """
    destino = destino or Llavero()
    if not anterior or anterior == servicio():
        return []
    copiadas: list[TipoDeCredencial] = []
    for tipo in TipoDeCredencial:
        if destino.obtener(tipo):
            continue
        valor = keyring.get_password(anterior, tipo.value)
        if valor:
            destino.guardar(tipo, valor)
            copiadas.append(tipo)
    return copiadas
