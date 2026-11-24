"""Perfil desde los datos del CV (D32): herramientas de «Habilidades» y años sacados de la experiencia.

- Los años de una herramienta son la unión de los periodos de las experiencias que la nombran.
- Una herramienta que está en Habilidades y en ninguna experiencia cuenta 0,5 años (proyectos o estudios).
- Un idioma «avanzado», C1, C2 o nativo cuenta como requisito cumplido (10 años).
"""

import re
from dataclasses import dataclass
from datetime import date

from ia.dominio.aviso import sin_tildes
from ia.dominio.calce import Perfil, normalizar

_MESES = {
    m: i + 1
    for i, m in enumerate(
        ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    )
}
_MESES.update(
    {
        m: i + 1
        for i, m in enumerate(
            ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        )
    }
)
SOLO_HABILIDAD = 0.5
# Una experiencia que nombra la de la derecha también cuenta para la de la izquierda.
IMPLICA = {"typescript": ("node.js", "nestjs"), "javascript": ("node.js", "vue", "nuxt", "nestjs")}


@dataclass(frozen=True)
class Experiencia:
    inicio: date
    fin: date
    texto: str


def fechas_de(rango: str, hoy: date) -> tuple[date, date] | None:
    """«ago. 2025 – actualidad», «dic. 2024 – mar. 2025», «ene. – mar. 2024»."""
    partes = [p.strip() for p in re.split(r"[–-]", sin_tildes(rango).lower()) if p.strip()]
    if len(partes) != 2:
        return None

    def una(texto: str, anio_por_defecto: int | None) -> date | None:
        if texto in {"actualidad", "presente", "present", "hoy"}:
            return hoy
        mes = next((n for m, n in _MESES.items() if texto.startswith(m)), None)
        anio = re.search(r"\d{4}", texto)
        a = int(anio.group(0)) if anio else anio_por_defecto
        return date(a, mes, 1) if mes and a else None

    fin = una(partes[1], None)
    inicio = una(partes[0], fin.year if fin else None)
    return (inicio, fin) if inicio and fin and inicio <= fin else None


def _anos(periodos: list[tuple[date, date]]) -> float:
    dias = 0
    ultimo_fin: date | None = None
    for inicio, fin in sorted(periodos):
        if ultimo_fin and inicio <= ultimo_fin:
            if fin > ultimo_fin:
                dias += (fin - ultimo_fin).days
                ultimo_fin = fin
            continue
        dias += (fin - inicio).days
        ultimo_fin = fin
    return round(dias / 365.25, 1)


def perfil_desde_cv(habilidades: list[str], idiomas: str, experiencias: list[Experiencia]) -> Perfil:
    herramientas: dict[str, float] = {}
    textos = [(e, " ".join(sin_tildes(e.texto).lower().split())) for e in experiencias]
    for h in habilidades:
        claves = (normalizar(h), *IMPLICA.get(normalizar(h), ()))
        periodos = [
            (e.inicio, e.fin)
            for e, texto in textos
            if any(re.search(rf"(?<![\w.]){re.escape(c)}(?![\w])", texto) for c in claves)
        ]
        herramientas[h] = max(_anos(periodos), SOLO_HABILIDAD) if periodos else SOLO_HABILIDAD
    if re.search(r"ingl[eé]s[^,]*(avanzado|c1|c2|nativo)", idiomas.lower()):
        herramientas["Inglés"] = 10
    return Perfil(herramientas, _anos([(e.inicio, e.fin) for e in experiencias]))
