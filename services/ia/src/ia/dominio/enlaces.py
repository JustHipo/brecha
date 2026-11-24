"""Enlaces del correo sin sacar tokens de la máquina (docs/diseno/pasos.md §5.4, D54).

Los enlaces de un portal suelen traer un token personal. En el fragmento que va al modelo se cambian por
«[enlace 1]», «[enlace 2]»…; la URL real queda en la base local y el código la pone en el paso. Solo se
guardan los de dominios del remitente o de plataformas conocidas; los demás se cambian por «[enlace]».
"""

import re
from urllib.parse import urlparse

from ia.dominio.reglas import DOMINIOS_DE_PLATAFORMAS, DOMINIOS_DE_SELECCION

_URL = re.compile(r"https?://[^\s<>()\"']+", re.IGNORECASE)
MAXIMO_ENLACES = 10


def _registrable(dominio: str) -> str:
    partes = dominio.lower().strip(".").split(".")
    if len(partes) >= 3 and partes[-2] in {"com", "co", "gob", "org", "net"}:
        return ".".join(partes[-3:])
    return ".".join(partes[-2:])


def _de_confianza(host: str, dominio_remitente: str | None) -> bool:
    h = host.lower().strip(".")
    conocidos = (*DOMINIOS_DE_PLATAFORMAS, *DOMINIOS_DE_SELECCION)
    if any(h == d or h.endswith("." + d) for d in conocidos):
        return True
    if not dominio_remitente:
        return False
    propio = _registrable(dominio_remitente)
    # «tenpo.teamtailor-mail.com» manda enlaces a «tenpo.teamtailor.com»: la misma empresa.
    etiqueta = dominio_remitente.lower().split(".")[0]
    return _registrable(h) == propio or (len(etiqueta) > 2 and h.startswith(etiqueta + "."))


def marcar_enlaces(texto: str, dominio_remitente: str | None) -> tuple[str, list[str]]:
    """Devuelve el texto con marcas y las URL guardadas (la de «[enlace 1]» es la primera)."""
    enlaces: list[str] = []

    def cambiar(m: re.Match[str]) -> str:
        url = m.group(0).rstrip(".,;:!?»")
        resto = m.group(0)[len(url) :]
        host = urlparse(url).hostname or ""
        if not _de_confianza(host, dominio_remitente):
            return "[enlace]" + resto
        if url not in enlaces:
            if len(enlaces) >= MAXIMO_ENLACES:
                return "[enlace]" + resto
            enlaces.append(url)
        return f"[enlace {enlaces.index(url) + 1}]" + resto

    return _URL.sub(cambiar, texto), enlaces


def enlace_numero(enlaces: list[str] | tuple[str, ...], numero: int | None) -> str | None:
    """El enlace que el modelo nombró por su número; nada si inventó uno."""
    if numero is None or numero < 1 or numero > len(enlaces):
        return None
    return enlaces[numero - 1]
