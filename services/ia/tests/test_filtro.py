import pytest

from ia.dominio.filtro import filtrar, plataforma_por_dominio
from tests.fabrica import correo


@pytest.mark.parametrize(
    ("remitente", "asunto", "texto", "pasa", "plataforma"),
    [
        ("jobs-noreply@linkedin.com", "Tu postulación a Backend fue vista", "", True, "linkedin"),
        ("jobs-noreply@linkedin.com", "Empleos recomendados para ti", "postulación", False, None),
        ("invitations@linkedin.com", "Ana quiere conectar contigo", "Hola", False, "linkedin"),
        (
            "no-reply@trabajando.com",
            "Resultado de tu proceso",
            "No continuaremos con tu postulación",
            True,
            "trabajando",
        ),
        ("team@getonbrd.com", "Your application to Ficticia", "", True, "getonboard"),
        ("notificaciones@computrabajo.cl", "Nuevas ofertas que te pueden interesar", "", False, None),
        ("no-reply@ficticia.greenhouse.io", "Gracias por tu interés", "Hola", True, "sitio_empresa"),
        ("rrhh@empresa-ficticia.test", "Coordinemos una entrevista", "Hola Juan", True, None),
        ("boletin@tienda.test", "Ofertas de verano", "Compra ahora", False, None),
        ("rrhh@empresa-ficticia.test", "Hola", "Te escribo por la prueba técnica del proceso", True, None),
        ("ofertas@tienda.test", "Producto seleccionado para ti", "", False, None),
        ("no-reply@talana.com", "Actualización", "Hola", True, "sitio_empresa"),
    ],
)
def test_filtro(remitente: str, asunto: str, texto: str, pasa: bool, plataforma: str | None) -> None:
    r = filtrar(correo(remitente=remitente, asunto=asunto, texto=texto))
    assert (r.pasa, r.plataforma) == (pasa, plataforma)
    assert r.motivo


def test_dominios_con_subdominio_y_sin_falsos_parecidos() -> None:
    assert plataforma_por_dominio("e.linkedin.com") == "linkedin"
    assert plataforma_por_dominio("linkedin.com.estafa.test") is None
    assert plataforma_por_dominio("notlinkedin.com") is None


def test_masivo_con_palabra_debil_no_pasa_pero_con_fuerte_si() -> None:
    boletin = correo(
        remitente="news@diario.test", asunto="Una entrevista con la ministra", texto="", masivo=True
    )
    assert filtrar(boletin).pasa is False
    personal = correo(remitente="rrhh@empresa.test", asunto="Una entrevista", texto="", masivo=False)
    assert filtrar(personal).pasa is True
    fuerte = correo(remitente="news@empresa.test", asunto="Tu postulación", texto="", masivo=True)
    assert filtrar(fuerte).pasa is True
