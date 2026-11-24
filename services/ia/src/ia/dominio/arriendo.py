"""Arriendos en el servicio con IA (docs/diseno/arriendos.md §7).

El filtro sin IA decide si un correo es de arriendo antes de que nada salga de la máquina (A-D6). El modelo
clasifica y extrae; el código valida y decide qué se manda al núcleo (IAAPP-008).
"""

import re
from dataclasses import dataclass, field

from ia.dominio.correo import CorreoLeido
from ia.dominio.filtro import normalizar

# El correo de arriendo queda en la cola con esta «plataforma»: lo toma su propio caso de uso.
PLATAFORMA_ARRIENDO = "arriendo"

# Portales de partida (los mismos canales iniciales del núcleo). Los que agregue la persona llegan del núcleo.
DOMINIOS_DE_ARRIENDO: frozenset[str] = frozenset(
    {
        "portalinmobiliario.com",
        "yapo.cl",
        "toctoc.com",
        "goplaceit.com",
        "icasas.cl",
    }
)

# Palabras que casi solo aparecen en correos de arriendo. Con una de estas pasa aunque el remitente no sea
# un portal.
PALABRAS_DE_ARRIENDO: tuple[str, ...] = (
    "arriendo",
    "arrendar",
    "arrendamiento",
    "arrendatario",
    "arrendador",
    "gastos comunes",
    "corredora de propiedades",
    "corretaje",
    "mes de garantia",
    "meses de garantia",
    "visita a la propiedad",
    "visitar la propiedad",
    "visitar el departamento",
    "departamento disponible",
    "propiedad disponible",
)

# Si además habla de una postulación de empleo, se deja al filtro de empleo.
PALABRAS_DE_EMPLEO: tuple[str, ...] = (
    "postulacion",
    "proceso de seleccion",
    "entrevista laboral",
    "cargo de",
)

ASUNTOS_DE_PUBLICIDAD: tuple[str, ...] = (
    "newsletter",
    "promocion",
    "oferta especial",
    "descuento",
    "black friday",
)


def dominio_en(dominio: str, dominios: frozenset[str]) -> bool:
    return any(dominio == d or dominio.endswith("." + d) for d in dominios)


def de_arriendo(correo: CorreoLeido, dominios_extra: frozenset[str] = frozenset()) -> str | None:
    """Motivo si el correo es de arriendo; None si no. Por dominio de un canal, o por palabras sin ser de
    empleo."""
    asunto = normalizar(correo.asunto)
    if any(p in asunto for p in ASUNTOS_DE_PUBLICIDAD):
        return None
    dominios = DOMINIOS_DE_ARRIENDO | dominios_extra
    if dominio_en(correo.dominio, dominios):
        return f"canal de arriendo: {correo.dominio}"
    comienzo = normalizar(f"{correo.asunto}\n{correo.texto[:1500]}")
    palabra = next((p for p in PALABRAS_DE_ARRIENDO if p in comienzo), None)
    if not palabra or any(p in comienzo for p in PALABRAS_DE_EMPLEO):
        return None
    if correo.masivo and palabra in {"arriendo", "arrendar"}:
        return None  # un boletín que dice «arriendo» no basta
    return f"palabra de arriendo: {palabra}"


# ── Clasificación de un correo ──

ESTADOS = (
    "vista",
    "contactada",
    "visita_agendada",
    "visitada",
    "en_evaluacion",
    "aprobada",
    "arrendada",
    "rechazada",
    "descartada",
    "no_disponible",
)
TIPOS = ("alerta", "mensaje", "visita", "documentos", "aprobacion", "rechazo", "no_disponible", "otro")
MONEDAS = ("CLP", "UF")


class ClasificacionInvalida(ValueError):
    pass


@dataclass(frozen=True)
class Precio:
    monto: float
    moneda: str

    def __post_init__(self) -> None:
        if self.moneda not in MONEDAS:
            raise ClasificacionInvalida(f"moneda desconocida: {self.moneda}")
        if self.monto <= 0:
            raise ClasificacionInvalida("el precio debe ser positivo")


@dataclass(frozen=True)
class Contacto:
    nombre: str | None = None
    telefono: str | None = None
    correo: str | None = None
    rol: str | None = None


@dataclass(frozen=True)
class AvisoEnAlerta:
    """Una propiedad que trae una alerta de un portal."""

    url: str | None
    titulo: str
    comuna: str | None = None
    precio: Precio | None = None
    dormitorios: int | None = None


@dataclass(frozen=True)
class ClasificacionArriendo:
    es_arriendo: bool
    tipo: str
    estado_sugerido: str | None
    resumen: str
    confianza: float
    url: str | None = None
    direccion: str | None = None
    comuna: str | None = None
    contacto: Contacto | None = None
    avisos: tuple[AvisoEnAlerta, ...] = ()

    def __post_init__(self) -> None:
        if self.tipo not in TIPOS:
            raise ClasificacionInvalida(f"tipo desconocido: {self.tipo}")
        if self.estado_sugerido is not None and self.estado_sugerido not in ESTADOS:
            raise ClasificacionInvalida(f"estado desconocido: {self.estado_sugerido}")
        if not 0 <= self.confianza <= 1:
            raise ClasificacionInvalida("la confianza va de 0 a 1")
        if not self.resumen.strip():
            raise ClasificacionInvalida("falta el resumen")


# Lo que una señal puede sugerir según lo que dice el correo. La IA no decide el salto: el núcleo lo valida.
ESTADO_POR_TIPO: dict[str, str] = {
    "visita": "visita_agendada",
    "documentos": "en_evaluacion",
    "aprobacion": "aprobada",
    "rechazo": "rechazada",
    "no_disponible": "no_disponible",
}


def solo_https(url: str | None) -> str | None:
    """Solo URLs web; nada de `javascript:` ni rutas sueltas."""
    if not url:
        return None
    u = url.strip()
    return u if re.match(r"^https?://[^\s/]+\.[^\s/]+", u) else None


# ── Propuestas a partir de un texto o un chat (A5) ──


@dataclass(frozen=True)
class PropuestaDePropiedad:
    """Lo que la IA sacó de un texto: la persona la revisa antes de guardarla."""

    titulo: str | None
    tipo: str
    direccion: str | None
    comuna: str | None
    precio: Precio | None
    gastos_comunes: float | None
    dormitorios: int | None
    banos: int | None
    m2: float | None
    estacionamientos: int | None
    mascotas: bool | None
    amoblado: bool | None
    url: str | None
    renta_veces: float | None
    aval: bool | None
    meses_garantia: float | None
    estado_sugerido: str | None
    contacto: Contacto | None
    nota: str | None
    mensajes: tuple[int, ...] = field(default=())
