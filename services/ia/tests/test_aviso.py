import pytest

from ia.aplicacion.casos.avisos import filtros_de_la_pregunta, url_normalizada
from ia.dominio.aviso import Aviso, AvisoInvalido, modalidad_de, plataforma_de, texto_plano
from ia.dominio.respuesta import NO_ENCONTRE, verificar_citas


def aviso(**kw: object) -> Aviso:
    base: dict[str, object] = {
        "url": "https://ejemplo.test/a/1",
        "titulo": "Backend",
        "empresa": "Ficticia",
        "plataforma": "otra",
        "modalidad": "remoto",
        "origen": "manual",
        "texto": "NestJS y PostgreSQL",
    }
    return Aviso(**{**base, **kw})  # type: ignore[arg-type]


def test_valida_url_titulo_y_valores() -> None:
    with pytest.raises(AvisoInvalido):
        aviso(url="no-es-url")
    with pytest.raises(AvisoInvalido):
        aviso(titulo=" ")
    with pytest.raises(AvisoInvalido):
        aviso(modalidad="a veces")


def test_plataforma_y_modalidad_desde_texto_libre() -> None:
    assert plataforma_de("Get on Board") == "getonboard"
    assert plataforma_de("LinkedIn post") == "linkedin"
    assert plataforma_de("Sitio de la empresa") == "sitio_empresa"
    assert plataforma_de("Himalayas") == "otra"
    assert modalidad_de("Remoto (LATAM)") == "remoto"
    assert modalidad_de("híbrido") == "hibrido"
    assert modalidad_de("") == "no_indica"


def test_texto_plano_quita_html() -> None:
    assert (
        texto_plano("<ul><li>Python</li><li>SQL &amp; NoSQL</li></ul><p>Fin</p>")
        == "- Python\n- SQL & NoSQL\nFin"
    )


def test_url_normalizada_quita_seguimiento_y_conserva_el_id() -> None:
    assert url_normalizada("https://www.getonbrd.com/jobs/x/?utm_source=y") == "getonbrd.com/jobs/x"
    assert (
        url_normalizada("https://cl.indeed.com/viewjob?jk=1&from=x&trk=z")
        == "cl.indeed.com/viewjob?from=x&jk=1"
    )
    assert url_normalizada("https://cl.indeed.com/viewjob?jk=1") != url_normalizada(
        "https://cl.indeed.com/viewjob?jk=2"
    )


def test_texto_para_embeber_tiene_tope() -> None:
    assert len(aviso(texto="x" * 10_000).para_embeber()) == 6000


def test_citas_fuera_de_lo_recuperado_se_descartan() -> None:
    r = verificar_citas("Hay dos", ["a", "z", "a"], ["a", "b"])
    assert r.citados == ("a",)
    assert r.descartados == ("z",)
    sin = verificar_citas("Invento", ["z"], ["a"])
    assert sin.texto == NO_ENCONTRE
    assert sin.citados == ()


def test_filtros_simples_desde_la_pregunta() -> None:
    assert filtros_de_la_pregunta("¿Qué avisos remotos piden NestJS?").modalidad == "remoto"
    f = filtros_de_la_pregunta("híbridos con sueldo sobre USD 2000")
    assert f.modalidad == "hibrido"
    assert f.usd_minimo == 2000
    assert filtros_de_la_pregunta("piden 2000 horas de vuelo").usd_minimo is None
