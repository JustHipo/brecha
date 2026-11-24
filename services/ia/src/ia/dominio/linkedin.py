"""Avisos de LinkedIn que llegan por correo (D40): mensajes nuevos e invitaciones.

LinkedIn no tiene API para tu red, pero te avisa por correo. De cada aviso sale quién (nombre, cargo
y perfil), qué pasó (mensaje recibido, invitación recibida o aceptada) y, del cargo, la empresa.
El texto del mensaje no viene en el correo: para leerlo hay que abrir LinkedIn.
"""

import re
from dataclasses import dataclass

from ia.dominio.correo import CorreoLeido

REMITENTES = (
    "messaging-digest-noreply@linkedin.com",
    "messages-noreply@linkedin.com",
    "invitations@linkedin.com",
    "invitations-noreply@linkedin.com",
    "inmail-hit-reply@linkedin.com",
)

# El asunto decide qué pasó (LinkedIn escribe en el idioma de tu cuenta).
_TIPOS = (
    ("solicitud_aceptada", r"accepted your invitation|aceptó tu invitación|ha aceptado tu invitación"),
    (
        "solicitud_recibida",
        r"wants to connect|invitation to connect|invited you to connect|quiere conectar|"
        r"te ha invitado a conectar|invitación para conectar|te invitó a conectar",
    ),
    (
        "mensaje_recibido",
        r"messaged you|sent you a message|new message|inmail|te envió un mensaje|te ha enviado un mensaje|"
        r"nuevo mensaje|mensajes? nuevos?|te escribió",
    ),
)

RESUMEN = {
    "mensaje_recibido": "Te escribió por LinkedIn (el texto no viene en el aviso: ábrelo en LinkedIn)",
    "solicitud_recibida": "Te invitó a conectar en LinkedIn",
    "solicitud_aceptada": "Aceptó tu invitación en LinkedIn",
}

_PERFIL = re.compile(r"https?://[^\s)\]>\"']*linkedin\.com/(?:comm/)?in/([A-Za-z0-9\-_%]+)")
# «Nombre (Cargo)» y, en la línea siguiente, el enlace a su perfil (versión de texto del aviso).
_ENTRADA = re.compile(
    r"^[ \t]*(?P<nombre>[^\n()]{2,80}?)[ \t]*\((?P<titular>[^\n]{0,300})\)[ \t]*\n[ \t]*\(?[ \t]*"
    r"https?://[^\s)]*linkedin\.com/(?:comm/)?in/(?P<slug>[A-Za-z0-9\-_%]+)",
    re.M,
)
_NOMBRE_EN_ASUNTO = re.compile(
    r"^(?P<nombre>.+?)\s+(?:just messaged you|sent you a message|accepted your invitation|"
    r"wants to connect|te envió un mensaje|te ha enviado un mensaje|aceptó tu invitación|"
    r"ha aceptado tu invitación|quiere conectar)",
    re.I,
)
_EMPRESA = re.compile(r"(?:\bat\b|\ben\b|@)\s+(?P<empresa>[^|·,]+?)\s*(?:[|·,]|$)", re.I)


@dataclass(frozen=True)
class AvisoDeLinkedin:
    tipo: str  # mensaje_recibido | solicitud_recibida | solicitud_aceptada
    nombre: str
    perfil_url: str
    titular: str | None
    empresa: str | None

    @property
    def resumen(self) -> str:
        return RESUMEN[self.tipo]


def es_de_linkedin(c: CorreoLeido) -> bool:
    return c.remitente.lower() in REMITENTES


def tipo_de(asunto: str) -> str | None:
    a = asunto.lower()
    return next((t for t, patron in _TIPOS if re.search(patron, a)), None)


def empresa_de(titular: str | None) -> str | None:
    """«CPO & Co-Founder at Ficticia | Pagos» → «Ficticia»; sin «at», «en» o «@», no se adivina."""
    if not titular:
        return None
    coincidencias = list(_EMPRESA.finditer(titular))
    empresa = coincidencias[-1].group("empresa").strip(" .") if coincidencias else ""
    return empresa or None


def leer_aviso(c: CorreoLeido) -> list[AvisoDeLinkedin]:
    """Las personas del aviso. Vacío si no es de un mensaje o una invitación (sugerencias, publicidad…)."""
    if not es_de_linkedin(c):
        return []
    tipo = tipo_de(c.asunto)
    if tipo is None:
        return []
    texto = c.texto.replace("\r\n", "\n").replace("\r", "\n")  # LinkedIn manda la versión de texto con CRLF
    avisos: list[AvisoDeLinkedin] = []
    vistos: set[str] = set()
    for m in _ENTRADA.finditer(texto):
        slug = m.group("slug").lower()
        if slug in vistos:
            continue
        vistos.add(slug)
        titular = m.group("titular").strip() or None
        avisos.append(
            AvisoDeLinkedin(
                tipo,
                m.group("nombre").strip(),
                f"https://www.linkedin.com/in/{slug}",
                titular,
                empresa_de(titular),
            )
        )
    if avisos:
        return avisos
    # Sin la forma «Nombre (Cargo)»: el nombre del asunto y el primer perfil del texto.
    perfil = _PERFIL.search(texto)
    nombre = _NOMBRE_EN_ASUNTO.match(c.asunto.strip())
    if perfil and nombre:
        slug = perfil.group(1).lower()
        return [
            AvisoDeLinkedin(
                tipo, nombre.group("nombre").strip(), f"https://www.linkedin.com/in/{slug}", None, None
            )
        ]
    return []
