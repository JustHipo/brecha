"""Chats exportados de WhatsApp («Exportar chat», sin archivos) y teléfonos que no salen hacia el modelo.

Formatos que se reconocen (iPhone y Android, en español e inglés):
- iPhone:  ``[24/11/26, 10:15:03] Ana Corredora: Hola``
- Android: ``24/11/26, 10:15 - Ana Corredora: Hola``  y  ``24/11/2026 10:15 p. m. - Ana: Hola``
Las líneas que no empiezan con fecha continúan el mensaje anterior. Los avisos del sistema (cifrado,
«cambió su número») no tienen autor y se descartan.
"""

import re
from dataclasses import dataclass
from datetime import datetime

_INVISIBLES = re.compile(r"[‎‏‪-‮⁦-⁩﻿]")
_HORA = r"(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?"
_IOS = re.compile(rf"^\[(\d{{1,2}})/(\d{{1,2}})/(\d{{2,4}}),?\s+{_HORA}\]\s+([^:]+?):\s?(.*)$", re.I)
_ANDROID = re.compile(rf"^(\d{{1,2}})/(\d{{1,2}})/(\d{{2,4}}),?\s+{_HORA}\s+-\s+([^:]+?):\s?(.*)$", re.I)
_ADJUNTO = re.compile(
    r"<(adjunto|attached|multimedia omitido|media omitted)[^>]*>|^(imagen|video|audio) omitid[oa]$", re.I
)


@dataclass(frozen=True)
class Mensaje:
    indice: int
    fecha: datetime
    autor: str
    texto: str


class ChatInvalido(ValueError):
    pass


def _fecha(d: str, m: str, a: str, h: str, mi: str, s: str | None, ampm: str | None) -> datetime:
    anio = int(a) + 2000 if len(a) == 2 else int(a)
    hora = int(h)
    if ampm:
        tarde = ampm.lower().startswith("p")
        hora = hora % 12 + (12 if tarde else 0)
    return datetime(anio, int(m), int(d), hora, int(mi), int(s or 0))


def leer_chat(texto: str, maximo: int = 2000) -> list[Mensaje]:
    """Mensajes del chat en orden. Días primero (dd/mm), como exporta WhatsApp en Chile."""
    mensajes: list[Mensaje] = []
    for linea in _INVISIBLES.sub("", texto).splitlines():
        m = _IOS.match(linea) or _ANDROID.match(linea)
        if m:
            d, mes, a, h, mi, s, ampm, autor, cuerpo = m.groups()
            try:
                fecha = _fecha(d, mes, a, h, mi, s, ampm)
            except ValueError:
                continue
            cuerpo = cuerpo.strip()
            if _ADJUNTO.search(cuerpo):
                cuerpo = ""
            mensajes.append(Mensaje(len(mensajes), fecha, autor.strip(), cuerpo))
        elif mensajes and linea.strip():
            ultimo = mensajes[-1]
            mensajes[-1] = Mensaje(
                ultimo.indice, ultimo.fecha, ultimo.autor, f"{ultimo.texto}\n{linea.strip()}".strip()
            )
    utiles = [x for x in mensajes if x.texto]
    if not utiles:
        raise ChatInvalido("No encontré mensajes: ¿es el .txt de «Exportar chat» de WhatsApp?")
    return [Mensaje(i, x.fecha, x.autor, x.texto) for i, x in enumerate(utiles[-maximo:])]


def autores(mensajes: list[Mensaje]) -> list[str]:
    vistos: list[str] = []
    for x in mensajes:
        if x.autor not in vistos:
            vistos.append(x.autor)
    return vistos


# ── Teléfonos: se reemplazan por marcas antes de ir al modelo y el código los vuelve a poner ──

_TELEFONO = re.compile(
    r"(?<![\w+])(?:\+?56[\s.-]?)?(?:9[\s.-]?\d{4}[\s.-]?\d{4}|2[\s.-]?\d{4}[\s.-]?\d{4})(?!\d)|\+\d[\d\s.-]{7,15}\d"
)


def enmascarar(texto: str) -> tuple[str, dict[str, str]]:
    """«Llámame al +56 9 8765 4321» → «Llámame al [tel 1]» y {"[tel 1]": "+56 9 8765 4321"}."""
    marcas: dict[str, str] = {}
    por_numero: dict[str, str] = {}

    def poner(m: re.Match[str]) -> str:
        numero = m.group(0)
        clave = re.sub(r"\D", "", numero)[-9:]
        if clave not in por_numero:
            por_numero[clave] = f"[tel {len(por_numero) + 1}]"
            marcas[por_numero[clave]] = numero.strip()
        return por_numero[clave]

    return _TELEFONO.sub(poner, texto), marcas


def desenmascarar(texto: str | None, marcas: dict[str, str]) -> str | None:
    if texto is None:
        return None
    for marca, numero in marcas.items():
        texto = texto.replace(marca, numero)
    return texto


def para_el_modelo(mensajes: list[Mensaje], yo: str | None) -> str:
    """El chat como texto numerado: [n] fecha · quien: texto. «Tú» es la persona dueña de Brecha."""
    lineas = []
    for x in mensajes:
        quien = "Tú" if yo and x.autor == yo else x.autor
        lineas.append(f"[{x.indice}] {x.fecha:%Y-%m-%d %H:%M} · {quien}: {x.texto}")
    return "\n".join(lineas)
