from datetime import UTC, datetime

from ia.dominio.correo import CorreoLeido


def correo(
    remitente: str = "jobs-noreply@linkedin.com",
    asunto: str = "Tu postulación a Backend fue vista",
    texto: str = "Hola, Ficticia vio tu postulación.",
    uid: int = 1,
    message_id: str | None = None,
    masivo: bool = False,
) -> CorreoLeido:
    return CorreoLeido(
        uid=uid,
        message_id=message_id or f"<{uid}@ejemplo.test>",
        remitente=remitente,
        nombre_remitente="",
        asunto=asunto,
        recibido_en=datetime(2026, 11, 20, 12, tzinfo=UTC),
        texto=texto,
        masivo=masivo,
    )
