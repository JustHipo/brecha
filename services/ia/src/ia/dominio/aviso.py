"""Avisos de empleo (F2-09): importados del artifact, de Get on Board o pegados a mano."""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date

MODALIDADES = ("remoto", "hibrido", "presencial", "no_indica")
ORIGENES = ("importado", "getonboard", "manual")

# Nombre de la fuente en el artifact o en el portal → plataforma del núcleo.
_PLATAFORMAS = {
    "linkedin": "linkedin",
    "get on board": "getonboard",
    "getonbrd": "getonboard",
    "getonboard": "getonboard",
    "computrabajo": "computrabajo",
    "chiletrabajos": "chiletrabajos",
    "trabajando": "trabajando",
    "indeed": "indeed",
    "sitio de la empresa": "sitio_empresa",
}


class AvisoInvalido(ValueError):
    pass


def sin_tildes(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def plataforma_de(fuente: str) -> str:
    f = sin_tildes(fuente).lower().strip()
    for clave, plataforma in _PLATAFORMAS.items():
        if f.startswith(clave):
            return plataforma
    return "otra"


def modalidad_de(texto: str | None) -> str:
    t = sin_tildes(texto or "").lower()
    if "remot" in t or "remote" in t:
        return "remoto"
    if "hibrid" in t or "hybrid" in t:
        return "hibrido"
    if "presencial" in t or "on-site" in t or "onsite" in t:
        return "presencial"
    return "no_indica"


def texto_plano(html: str) -> str:
    """Quita etiquetas y espacios de más (Get on Board manda HTML)."""
    t = re.sub(r"<\s*(br|/p|/li|/h\d)\s*/?>", "\n", html, flags=re.I)
    t = re.sub(r"<li[^>]*>", "- ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = (
        t.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()


@dataclass(frozen=True)
class Aviso:
    url: str
    titulo: str
    empresa: str
    plataforma: str
    modalidad: str
    origen: str
    texto: str
    ubicacion: str | None = None
    stack: tuple[str, ...] = ()
    sueldo: str | None = None
    usd_mes: int | None = None
    publicado_en: date | None = None
    cierre: date | None = None
    cita: str | None = None  # de dónde viene, para mostrarlo junto al enlace (Get on Board lo pide)
    extra: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not re.match(r"^https?://\S+$", self.url):
            raise AvisoInvalido(f"url inválida: {self.url[:80]}")
        if not self.titulo.strip() or not self.empresa.strip():
            raise AvisoInvalido("el aviso necesita título y empresa")
        if self.modalidad not in MODALIDADES:
            raise AvisoInvalido(f"modalidad desconocida: {self.modalidad}")
        if self.origen not in ORIGENES:
            raise AvisoInvalido(f"origen desconocido: {self.origen}")

    def para_embeber(self) -> str:
        """Lo que se convierte en vector (F2-11): título, empresa, stack y texto, con un tope."""
        partes = [self.titulo, self.empresa, ", ".join(self.stack), self.modalidad, self.texto]
        return "\n".join(p for p in partes if p)[:6000]
