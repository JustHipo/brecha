"""Lectura de archivos locales: avisos del artifact (F2-09) y perfil o datos del CV (D32).

Los archivos reales viven en `datos/privado/` (nunca al repo, ADR 0008).
"""

import json
from collections.abc import Callable
from datetime import date
from functools import partial
from pathlib import Path
from typing import Any

from ia.dominio.aviso import Aviso, modalidad_de, plataforma_de
from ia.dominio.calce import Perfil
from ia.dominio.perfil import Experiencia, fechas_de, perfil_desde_cv


def _fecha(texto: str | None) -> date | None:
    try:
        return date.fromisoformat(texto) if texto else None
    except ValueError:
        return None


def _aviso_del_artifact(d: dict[str, Any]) -> Aviso:
    texto = "\n".join(
        f"{etiqueta}: {d[k]}"
        for etiqueta, k in (
            ("Perfil buscado", "perfil_buscado"),
            ("Tareas", "tareas"),
            ("Experiencia pedida", "experiencia_pedida"),
            ("Seniority", "seniority"),
            ("Jornada", "jornada"),
        )
        if d.get(k)
    )
    return Aviso(
        url=d["url"],
        titulo=d["titulo"],
        empresa=d["empresa"],
        plataforma=plataforma_de(d.get("fuente", "")),
        modalidad=modalidad_de(d.get("modalidad")),
        origen="importado",
        texto=texto or d["titulo"],
        ubicacion=d.get("ubicacion") or None,
        stack=tuple(d.get("stack") or ()),
        sueldo=d.get("sueldo") or None,
        usd_mes=d.get("usd_mes"),
        publicado_en=_fecha(d.get("fecha_publicacion")),
        cierre=_fecha(d.get("cierre")),
        cita=f"Tu búsqueda ({d.get('fuente') or 'fuente sin nombre'})",
    )


def avisos_del_archivo(ruta: Path) -> list[Callable[[], Aviso]]:
    """Acepta la lista `DATA` del artifact (una lista de avisos) o un objeto con la llave `avisos`."""
    crudo = json.loads(ruta.read_text(encoding="utf-8"))
    lista = crudo["avisos"] if isinstance(crudo, dict) else crudo
    return [partial(_aviso_del_artifact, d) for d in lista]


def perfil_del_archivo(ruta: Path, hoy: date) -> Perfil:
    """Un perfil (`herramientas` y `anosTotales`) o los datos del CV (`es.aptitudes` y `es.experiencia`)."""
    crudo = json.loads(ruta.read_text(encoding="utf-8"))
    if "herramientas" in crudo:
        return Perfil(
            {k: float(v) for k, v in crudo["herramientas"].items()}, float(crudo.get("anosTotales", 0))
        )
    cv = crudo.get("es", crudo)
    habilidades: list[str] = []
    idiomas = ""
    for categoria, lista in cv["aptitudes"]:
        if categoria.lower().startswith("idioma"):
            idiomas = lista
            continue
        habilidades += [h.strip() for h in lista.split(",") if h.strip()]
    experiencias = []
    for e in cv.get("experiencia", []):
        rango = fechas_de(e.get("fechas", ""), hoy)
        if rango:
            texto = " ".join([e.get("cargo", ""), e.get("contexto", ""), *e.get("vinetas", [])])
            experiencias.append(Experiencia(rango[0], rango[1], texto))
    return perfil_desde_cv(habilidades, idiomas, experiencias)
