"""El fragmento es lo único del correo que sale hacia el modelo (docs/diseno/f2.md §4, paso 3)."""

import re

MAXIMO = 4000

_CITA = re.compile(
    r"^(El .{3,200} escribió:|On .{3,200} wrote:"
    r"|-{2,} ?(Mensaje original|Original Message|Forwarded message) ?-{2,}"
    r"|De: .+|From: .+)$",
    re.IGNORECASE,
)
_FIRMA = re.compile(
    r"^(-- ?|Saludos,?|Atentamente,?|Best regards,?|Regards,?|Enviado desde mi .+|Sent from my .+)$",
    re.IGNORECASE,
)
_PIE = re.compile(
    r"(darte de baja|unsubscribe|cancelar la suscripci[oó]n|privacy policy|pol[ií]tica de privacidad)",
    re.IGNORECASE,
)


def fragmento(texto: str, maximo: int = MAXIMO) -> str:
    """Texto sin historial citado, sin firma ni pie legal, con espacios compactados y recortado."""
    lineas: list[str] = []
    for linea in texto.replace("\r\n", "\n").split("\n"):
        limpia = linea.strip()
        if _CITA.match(limpia):
            break  # desde aquí es historial
        if limpia.startswith(">"):
            continue
        if _FIRMA.match(limpia) and len(lineas) > 2:
            break
        if _PIE.search(limpia):
            continue
        lineas.append(" ".join(limpia.split()))
    unido = re.sub(r"\n{3,}", "\n\n", "\n".join(lineas)).strip()
    return unido[:maximo]
