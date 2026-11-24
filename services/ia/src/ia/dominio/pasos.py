"""Pasos pendientes (docs/diseno/pasos.md §5): candidatas por código, verificación de lo que elige el modelo.

El modelo propone a qué postulaciones va un correo y qué pide; el código arma las candidatas, aplica las
reglas seguras (el número del aviso, el hilo) y verifica la elección (IAAPP-008, como las citas de Preguntar).
"""

import re
from dataclasses import dataclass, field, replace
from urllib.parse import urlparse

from ia.dominio.asociacion import (
    PostulacionConocida,
    normalizar_cargo,
    normalizar_empresa,
    parecido,
    parecido_cargo,
)
from ia.dominio.reglas import DOMINIOS_DE_SELECCION, dominio_compartido

MAXIMO_CANDIDATAS = 8
EMPRESA_COINCIDE = 0.8
_NUMERO = re.compile(r"(?<!\d)\d{6,}(?!\d)")
_GENERICAS = {"plataforma", "sitio_empresa", "otra"}


def id_de_aviso(url: str) -> str | None:
    """El último grupo de 6 o más dígitos de la ruta de la URL del aviso (igual que el núcleo)."""
    try:
        ruta = urlparse(url).path
    except ValueError:
        return None
    grupos = re.findall(r"\d{6,}", ruta)
    return grupos[-1] if grupos else None


def numeros_en(*textos: str) -> set[str]:
    """Números de 6 o más dígitos del asunto, el fragmento y los enlaces («#3916453», «…-3916453»)."""
    return {n for t in textos if t for n in _NUMERO.findall(t)}


def empresa_del_ats(dominio: str | None) -> str | None:
    """«tenpo.teamtailor-mail.com» → «tenpo»: la empresa que usa el sistema de selección."""
    if not dominio:
        return None
    d = dominio.lower().strip(".")
    for ats in DOMINIOS_DE_SELECCION:
        if d.endswith("." + ats):
            sub = d[: -len(ats) - 1].split(".")
            nombre = sub[-1].replace("-", " ").strip() if sub else ""
            return nombre if nombre and nombre not in {"www", "mail", "jobs", "careers", "app"} else None
    return None


@dataclass(frozen=True)
class Candidata:
    postulacion: PostulacionConocida
    motivo: str
    puntaje: float
    segura: bool = False
    empresa_coincide: bool = False

    @property
    def id(self) -> str:
        return self.postulacion.id


def _plataformas_compatibles(a: str | None, b: str) -> bool:
    return not a or a == b or a in _GENERICAS or b in _GENERICAS


def candidatas(
    *,
    empresa: str | None,
    cargo: str | None,
    plataforma: str | None,
    dominio_remitente: str | None,
    textos: tuple[str, ...],
    conocidas: list[PostulacionConocida],
    del_hilo: tuple[str, ...] = (),
    del_dominio: tuple[str, ...] = (),
    maximo: int = MAXIMO_CANDIDATAS,
) -> list[Candidata]:
    """Hasta `maximo` candidatas, abiertas o cerradas (J6), las seguras primero.

    Seguras: el número del aviso aparece en el correo (misma plataforma) o el correo responde a uno ya
    asociado (hilo). Las demás salen de la empresa (también la del ATS, «tenpo.teamtailor-mail.com»)
    y del cargo.
    """
    por_id: dict[str, Candidata] = {}
    numeros = numeros_en(*textos)
    for p in conocidas:
        n = id_de_aviso(p.url) if p.url else None
        if n and n in numeros and _plataformas_compatibles(plataforma, p.plataforma):
            por_id[p.id] = Candidata(p, f"número del aviso {n}", 1.0, segura=True)
    for p in conocidas:
        if p.id in del_hilo and p.id not in por_id:
            por_id[p.id] = Candidata(p, "mismo hilo", 1.0, segura=True)
    # El dominio del remitente ya escribió por una postulación: si es una sola, va ahí (regla segura);
    # si fueron varias (la misma empresa por varios cargos), son candidatas y el modelo elige.
    # Un dominio compartido (correo personal, portal o sistema de selección) no dice de qué empresa es.
    if dominio_compartido(dominio_remitente):
        del_dominio = ()
    unica = len(set(del_dominio)) == 1
    for p in conocidas:
        if p.id in del_dominio and p.id not in por_id:
            por_id[p.id] = Candidata(p, "mismo dominio que un correo de esa postulación", 1.0, unica, True)

    nombre_empresa = empresa or empresa_del_ats(dominio_remitente)
    e = normalizar_empresa(nombre_empresa) if nombre_empresa else ""
    c = normalizar_cargo(cargo or "")
    texto = f" {normalizar_cargo(' '.join(textos))} "
    otras: list[Candidata] = []
    for p in conocidas:
        pe = parecido(e, normalizar_empresa(p.empresa)) if e else 0.0
        pc = parecido_cargo(c, normalizar_cargo(p.titulo)) if c else 0.0
        # Antes del modelo no hay empresa extraída: se busca el nombre de la empresa en el texto.
        propia = normalizar_empresa(p.empresa)
        en_texto = len(propia) >= 3 and f" {propia} " in texto
        coincide = pe >= EMPRESA_COINCIDE or en_texto
        if p.id in por_id:
            if coincide:
                por_id[p.id] = replace(por_id[p.id], empresa_coincide=True)
            continue
        if pe >= EMPRESA_COINCIDE:
            otras.append(
                Candidata(p, "empresa", round(0.55 * pe + 0.45 * (pc if c else 0.5), 3), False, True)
            )
        elif en_texto:
            cargo_en_texto = parecido_cargo(normalizar_cargo(p.titulo), texto.strip())
            otras.append(
                Candidata(p, "empresa en el texto", round(0.6 + 0.4 * cargo_en_texto, 3), False, True)
            )
        elif not e and c and pc >= 0.75:
            otras.append(Candidata(p, "cargo", pc))
    # Entre iguales, primero las abiertas: el mismo cargo publicado de nuevo suele ser el que sigue en curso.
    otras.sort(key=lambda x: (-x.puntaje, not x.postulacion.activa))
    primero = sorted(por_id.values(), key=lambda x: not x.segura)
    return (primero + otras)[: max(maximo, len(primero))]


@dataclass(frozen=True)
class Decision:
    """A qué postulaciones va el correo. Sin ids, a la bandeja con las candidatas marcadas."""

    postulacion_ids: tuple[str, ...]
    candidatas: tuple[str, ...]
    motivo: str


def decidir(lista: list[Candidata], elegidas: list[str] | None, clasica: str | None = None) -> Decision:
    """Verifica la elección del modelo contra las candidatas (D50).

    - Las seguras mandan; el modelo puede sumar otras si son candidatas con la empresa coincidente.
    - Sin seguras, se acepta lo que eligió el modelo si todo está entre las candidatas con la empresa
      coincidente. Si eligió algo que no cumple, o nada, va a la bandeja.
    - `elegidas is None` (sin contexto para el modelo): se usa la asociación de antes (`clasica`).
    """
    ids = tuple(c.id for c in lista)
    seguras = [c.id for c in lista if c.segura]
    validas = {c.id for c in lista if c.empresa_coincide}
    todas = ids + ((clasica,) if clasica and clasica not in ids else ())
    if seguras:
        extra = [x for x in (elegidas or []) if x in validas and x not in seguras]
        return Decision(tuple(seguras + extra), todas, "regla segura" + (" y el modelo" if extra else ""))
    if elegidas is None or (not elegidas and clasica and clasica not in ids):
        # Sin contexto, o el modelo no vio la postulación que calza por empresa y cargo: la de antes.
        if clasica:
            return Decision((clasica,), todas, "asociación por empresa y cargo")
        return Decision((), todas, "sin candidata clara")
    if elegidas and all(x in validas for x in elegidas):
        return Decision(tuple(dict.fromkeys(elegidas)), todas, "elegida por el modelo")
    if elegidas:
        return Decision((), todas, "el modelo eligió una postulación que no calza con la empresa")
    return Decision((), todas, "el modelo no la asoció a ninguna")


# ── Lo que el modelo ve de cada candidata (§5.2) ─────────────────────────────────


@dataclass(frozen=True)
class PasoConocido:
    id: str
    descripcion: str
    estado: str  # pendiente | hecho | descartado
    plazo: str | None = None
    cerrado_por: str | None = None
    cerrado_en: str | None = None  # AAAA-MM-DD


@dataclass(frozen=True)
class ContextoDePostulacion:
    id: str
    empresa: str
    titulo: str
    estado: str
    pasos: tuple[PasoConocido, ...] = ()
    senales: tuple[tuple[str, str], ...] = ()  # (AAAA-MM-DD, resumen), las más nuevas primero


@dataclass(frozen=True)
class CandidataParaModelo:
    """Una candidata con ids cortos: los UUID no salen hacia el modelo."""

    corto: str  # p1, p2…
    contexto: ContextoDePostulacion
    pasos_cortos: dict[str, str] = field(default_factory=dict)  # s1 → id real

    def texto(self, hoy: str) -> str:
        c = self.contexto
        lineas = [f"{self.corto}: {c.empresa} · {c.titulo} · estado {c.estado}"]
        inverso = {v: k for k, v in self.pasos_cortos.items()}
        pendientes = [p for p in c.pasos if p.estado == "pendiente"]
        cerrados = [p for p in c.pasos if p.estado != "pendiente"]
        for p in pendientes:
            plazo = f", plazo {p.plazo}" if p.plazo else ""
            lineas.append(f"  paso pendiente {inverso[p.id]}: {p.descripcion}{plazo}")
        for p in cerrados[-4:]:
            quien = {"persona": "la persona", "ia": "su IA", "correo": "un correo", "sistema": "el sistema"}
            lineas.append(
                f"  paso {p.estado} ({quien.get(p.cerrado_por or '', 'alguien')}"
                f"{', ' + p.cerrado_en if p.cerrado_en else ''}): {p.descripcion}"
            )
        for fecha, resumen in c.senales[:3]:
            lineas.append(f"  correo del {fecha}: {resumen}")
        return "\n".join(lineas)


def para_modelo(contextos: list[ContextoDePostulacion]) -> list[CandidataParaModelo]:
    salida: list[CandidataParaModelo] = []
    n = 0
    for i, c in enumerate(contextos, start=1):
        cortos: dict[str, str] = {}
        for p in c.pasos:
            if p.estado == "pendiente":
                n += 1
                cortos[f"s{n}"] = p.id
        salida.append(CandidataParaModelo(f"p{i}", c, cortos))
    return salida
