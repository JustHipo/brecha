"""Asociación sin IA (docs/diseno/f2.md §4, paso 5): empresa y cargo contra tus postulaciones.

Asocia solo si hay una candidata clara; si no, la señal va a la bandeja y decides tú.
"""

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

SUFIJOS = re.compile(
    r"\b(s\.?\s?a\.?|spa|s\.?p\.?a\.?|ltda\.?|limitada|chile|cl|group|grupo|inc\.?|llc|sas|eirl|"
    r"consultores|consulting|tecnolog[ií]a|technologies|software|labs?)\b"
)
PARENTESIS = re.compile(r"\(.*?\)")
UMBRAL = 0.72
MARGEN = 0.12


@dataclass(frozen=True)
class PostulacionConocida:
    id: str
    empresa: str
    titulo: str
    plataforma: str
    activa: bool


@dataclass(frozen=True)
class ResultadoAsociacion:
    postulacion_id: str | None
    puntaje: float
    motivo: str


def normalizar_empresa(nombre: str) -> str:
    t = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower()
    t = PARENTESIS.sub(" ", t)
    t = SUFIJOS.sub(" ", t)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", t).split())


def normalizar_cargo(cargo: str) -> str:
    t = unicodedata.normalize("NFKD", cargo).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"\b(a|o)/(a|o)\b|/a\b|\(a\)", " ", t)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", t).split())


def parecido(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b or a in b.split() or b in a.split():
        return 1.0
    palabras_a, palabras_b = set(a.split()), set(b.split())
    jaccard = len(palabras_a & palabras_b) / len(palabras_a | palabras_b)
    return max(jaccard, SequenceMatcher(None, a, b).ratio())


VACIAS = {"de", "del", "la", "el", "en", "y", "para", "con", "a", "the", "and", "of", "for"}


def parecido_cargo(a: str, b: str) -> float:
    """Por palabras: qué parte del cargo más corto aparece en el otro (el orden y el largo importan poco)."""
    pa = {w for w in a.split() if w not in VACIAS}
    pb = {w for w in b.split() if w not in VACIAS}
    if not pa or not pb:
        return 0.0
    comun = len(pa & pb)
    contenido = comun / min(len(pa), len(pb))
    jaccard = comun / len(pa | pb)
    return round(0.7 * contenido + 0.3 * jaccard, 3)


def asociar(
    empresa: str | None, cargo: str | None, plataforma: str, conocidas: list[PostulacionConocida]
) -> ResultadoAsociacion:
    """Puntaje por empresa (necesaria) y cargo.

    Si dos quedan empatadas, decide la plataforma por la que llegó.
    """
    if not empresa:
        return ResultadoAsociacion(None, 0.0, "sin empresa detectada")
    e = normalizar_empresa(empresa)
    c = normalizar_cargo(cargo or "")
    puntajes: list[tuple[float, PostulacionConocida]] = []
    for p in conocidas:
        pe = parecido(e, normalizar_empresa(p.empresa))
        if pe < 0.8:
            continue
        pc = parecido_cargo(c, normalizar_cargo(p.titulo)) if c else 0.5
        puntajes.append((round(0.55 * pe + 0.45 * pc, 3), p))
    if not puntajes:
        return ResultadoAsociacion(None, 0.0, "ninguna postulación de esa empresa")
    puntajes.sort(key=lambda x: -x[0])
    mejor, p = puntajes[0]
    if mejor < UMBRAL:
        return ResultadoAsociacion(None, mejor, f"puntaje bajo ({mejor})")
    empatadas = [q for s, q in puntajes if mejor - s < MARGEN]
    if len(empatadas) == 1:
        return ResultadoAsociacion(p.id, mejor, f"asociada ({mejor})")
    por_plataforma = [q for q in empatadas if q.plataforma == plataforma]
    if len(por_plataforma) == 1:
        return ResultadoAsociacion(por_plataforma[0].id, mejor, f"asociada por plataforma ({mejor})")
    return ResultadoAsociacion(None, mejor, f"ambigua: {len(empatadas)} candidatas parecidas ({mejor})")
