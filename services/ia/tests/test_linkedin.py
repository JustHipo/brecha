"""Avisos de LinkedIn por correo, con la forma real de los avisos (nombres y empresas inventados)."""

from datetime import UTC, datetime

from ia.dominio.correo import CorreoLeido
from ia.dominio.linkedin import empresa_de, leer_aviso, tipo_de

TEXTO_MENSAJE = """You have 1 new message

.....................................

Ana Ficticia (CPO, CTO & Co-Founder at Pino Rojo Soluciones)
(https://www.linkedin.com/comm/in/ana-ficticia?midToken=AQ&trk=eml)

View message: https://www.linkedin.com/comm/messaging/thread/2-abc?trk=eml

.....................................

This email was intended for Persona Ejemplo (Full Stack Developer)
"""

TEXTO_DOS = """You have 2 new messages

Ana Ficticia (Recruiter at Norte Datos)
(https://www.linkedin.com/comm/in/ana-ficticia?x=1)

View message: https://www.linkedin.com/comm/messaging/thread/1

Luis Ejemplo (Tech Lead | Backend en Lago Software · NestJS)
(https://www.linkedin.com/comm/in/luis-ejemplo-123?x=1)

View message: https://www.linkedin.com/comm/messaging/thread/2
"""


def correo(remitente: str, asunto: str, texto: str) -> CorreoLeido:
    return CorreoLeido(
        1, "<a@linkedin.com>", remitente, "", asunto, datetime(2026, 11, 24, tzinfo=UTC), texto, True
    )


def test_tipo_por_el_asunto_en_ingles_y_en_castellano() -> None:
    assert tipo_de("Ana just messaged you") == "mensaje_recibido"
    assert tipo_de("Ana te envió un mensaje") == "mensaje_recibido"
    assert tipo_de("Ana accepted your invitation") == "solicitud_aceptada"
    assert tipo_de("Ana aceptó tu invitación") == "solicitud_aceptada"
    assert tipo_de("Ana wants to connect") == "solicitud_recibida"
    assert tipo_de("Podrías conocer a una persona de Ficticia") is None
    assert tipo_de("Back End Developer: Ficticia hired near you") is None


def test_empresa_desde_el_cargo() -> None:
    assert empresa_de("CPO, CTO & Co-Founder at Pino Rojo Soluciones") == "Pino Rojo Soluciones"
    assert empresa_de("Tech Lead | Backend en Lago Software · NestJS") == "Lago Software"
    assert empresa_de("Ingeniera de Software @ Faro") == "Faro"
    assert empresa_de("Full Stack Developer") is None
    assert empresa_de(None) is None


def test_un_mensaje_nuevo() -> None:
    avisos = leer_aviso(
        correo("messaging-digest-noreply@linkedin.com", "Ana just messaged you", TEXTO_MENSAJE)
    )
    assert len(avisos) == 1
    a = avisos[0]
    assert (a.tipo, a.nombre, a.perfil_url) == (
        "mensaje_recibido",
        "Ana Ficticia",
        "https://www.linkedin.com/in/ana-ficticia",
    )
    assert a.empresa == "Pino Rojo Soluciones"
    assert "LinkedIn" in a.resumen


def test_varios_mensajes_en_un_aviso_y_sin_repetir() -> None:
    avisos = leer_aviso(
        correo("messaging-digest-noreply@linkedin.com", "You have 2 new messages", TEXTO_DOS + TEXTO_DOS)
    )
    assert [(a.nombre, a.empresa) for a in avisos] == [
        ("Ana Ficticia", "Norte Datos"),
        ("Luis Ejemplo", "Lago Software"),
    ]


def test_sin_la_forma_de_lista_usa_el_asunto_y_el_primer_perfil() -> None:
    texto = "Hola\nMira su perfil: https://www.linkedin.com/comm/in/Ana-Ficticia?trk=1\n"
    avisos = leer_aviso(correo("invitations@linkedin.com", "Ana Ficticia accepted your invitation", texto))
    assert [(a.tipo, a.nombre, a.perfil_url) for a in avisos] == [
        ("solicitud_aceptada", "Ana Ficticia", "https://www.linkedin.com/in/ana-ficticia")
    ]


def test_lo_que_no_es_mensaje_ni_invitacion_se_ignora() -> None:
    assert (
        leer_aviso(
            correo(
                "messages-noreply@linkedin.com", "Podrías conocer a una persona de Ficticia", TEXTO_MENSAJE
            )
        )
        == []
    )
    assert leer_aviso(correo("jobs-noreply@linkedin.com", "Ana just messaged you", TEXTO_MENSAJE)) == []


def test_con_saltos_de_linea_de_windows() -> None:
    texto = TEXTO_MENSAJE.replace("\n", "\r\n")
    avisos = leer_aviso(correo("messaging-digest-noreply@linkedin.com", "Ana just messaged you", texto))
    assert [(a.nombre, a.empresa) for a in avisos] == [("Ana Ficticia", "Pino Rojo Soluciones")]
