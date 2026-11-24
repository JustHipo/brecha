import os
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from ia.aplicacion.puertos import CorreoGuardado, PuntoDeLectura
from ia.dominio.correo import EstadoDeCorreo
from ia.infraestructura.config import cargar_config
from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos
from ia.infraestructura.postgres.motor import crear_motor


@pytest.fixture
def repo() -> RepositorioPostgresDeCorreos:
    url = os.environ.get("IA_DATABASE_URL_PRUEBAS")
    if not url:
        cfg = cargar_config()
        url = cfg.ia_database_url.replace("/brecha", "/brecha_pruebas")
    motor = crear_motor(url)
    with motor.begin() as c:
        c.execute(text("TRUNCATE ia.correo, ia.estado_vigia, ia.clasificacion, ia.traza"))
    return RepositorioPostgresDeCorreos(motor)


def g(mid: str, estado: EstadoDeCorreo, fragmento: str | None = None) -> CorreoGuardado:
    return CorreoGuardado(
        mid, 1, "a@b.test", datetime(2026, 11, 20, tzinfo=UTC), estado, "linkedin", "m", "asunto", fragmento
    )


def test_guarda_sin_duplicar_y_cuenta_la_cola(repo: RepositorioPostgresDeCorreos) -> None:
    repo.guardar(g("<1@x>", EstadoDeCorreo.PENDIENTE, "texto"))
    repo.guardar(g("<1@x>", EstadoDeCorreo.PENDIENTE, "otro"))
    repo.guardar(g("<2@x>", EstadoDeCorreo.FILTRADO))
    assert repo.existe("<1@x>") and not repo.existe("<3@x>")
    assert repo.en_cola() == 1


def test_punto_de_lectura(repo: RepositorioPostgresDeCorreos) -> None:
    assert repo.punto_de_lectura() == PuntoDeLectura(None, None)
    ahora = datetime.now(UTC)
    repo.registrar_revision(PuntoDeLectura(42, 9), ahora, None)
    repo.registrar_revision(PuntoDeLectura(42, 15), ahora, "error de prueba")
    assert repo.punto_de_lectura() == PuntoDeLectura(42, 15)


def test_cola_de_clasificacion(repo: RepositorioPostgresDeCorreos) -> None:
    from ia.dominio.clasificacion import Clasificacion

    repo.guardar(g("<1@x>", EstadoDeCorreo.PENDIENTE, "texto"))
    repo.guardar(g("<2@x>", EstadoDeCorreo.PENDIENTE, "texto"))
    assert [c.message_id for c in repo.pendientes(10)] == ["<1@x>", "<2@x>"]
    repo.marcar_clasificado(
        "<1@x>", Clasificacion(True, "linkedin", "F", "B", "entrevista", "r", 0.8), "gpt-prueba"
    )
    for _ in range(5):
        repo.marcar_intento_fallido("<2@x>", 5)
    assert repo.pendientes(10) == [] and repo.en_cola() == 0
    repo.registrar_error_ia("cuota: sin saldo")
    repo.registrar_error_ia(None)


def test_estado_para_conexiones(repo: RepositorioPostgresDeCorreos) -> None:
    from ia.aplicacion.puertos import Traza
    from ia.infraestructura.postgres.correos import TrazasPostgres

    repo.guardar(g("<1@x>", EstadoDeCorreo.PENDIENTE, "texto"))
    repo.registrar_revision(PuntoDeLectura(1, 2), datetime(2026, 11, 24, tzinfo=UTC), None)
    TrazasPostgres(repo.motor).registrar(
        Traza("clasificar_correo", "m", 10, 2, 0.0012, 5, "ok", datetime.now(UTC))
    )
    e = repo.estado(datetime(2026, 11, 1, tzinfo=UTC))
    assert (
        (e.en_cola, e.llamadas_mes) == (1, 1) and e.gasto_mes_usd == 0.0012 and e.ultima_revision is not None
    )


def test_hilo_enlaces_y_decision_ida_y_vuelta(repo: RepositorioPostgresDeCorreos) -> None:
    from ia.aplicacion.puertos import DecisionGuardada, PasoParaNucleo
    from ia.dominio.clasificacion import Clasificacion, PasoDetectado

    repo.guardar(
        CorreoGuardado(
            "<a@x>",
            1,
            "info@chiletrabajos.cl",
            datetime(2026, 11, 23, tzinfo=UTC),
            EstadoDeCorreo.PENDIENTE,
            "chiletrabajos",
            "m",
            "Continua tu Postulacion #3916453",
            "Completa el test en [enlace 1]",
            en_respuesta_a="<previo@x>",
            referencias=("<raiz@x>", "<previo@x>"),
            enlaces=("https://www.chiletrabajos.cl/test?token=x",),
        )
    )
    [c] = repo.pendientes(10)
    assert c.en_respuesta_a == "<previo@x>" and c.referencias == ("<raiz@x>", "<previo@x>")
    assert c.enlaces == ("https://www.chiletrabajos.cl/test?token=x",)
    k = Clasificacion(
        True, "chiletrabajos", None, None, "en_proceso", "Test", 0.95, (), PasoDetectado("Completar el test")
    )
    d = DecisionGuardada(
        ("p1", "p2"),
        ("p1", "p2"),
        "regla segura",
        PasoParaNucleo("Completar el test", plazo="2026-11-30", enlace="https://x.test"),
        (("s-real", 0.95),),
    )
    repo.marcar_clasificado("<a@x>", k, "gpt-prueba", d)
    [e] = repo.por_enviar(10)
    assert e.clasificacion == k and e.decision == d
    repo.marcar_enviado("<a@x>", ("p1", "p2"))
    assert repo.del_hilo(("<a@x>", "<otro@x>")) == ("p1", "p2")
    assert repo.del_hilo(()) == ()


def test_remitentes_conocidos_y_releer(repo: RepositorioPostgresDeCorreos) -> None:
    from ia.dominio.clasificacion import Clasificacion

    def guardado(mid: str, remitente: str, estado: EstadoDeCorreo) -> CorreoGuardado:
        return CorreoGuardado(
            mid, 1, remitente, datetime(2026, 11, 24, tzinfo=UTC), estado, None, "m", "a", "t"
        )

    repo.guardar(guardado("<s@fs>", "svalencia@fullstacklabs.co", EstadoDeCorreo.PENDIENTE))
    repo.guardar(guardado("<p@g>", "persona@gmail.com", EstadoDeCorreo.PENDIENTE))
    k = Clasificacion(True, "otra", "FullStack", None, "entrevista", "r", 0.9)
    repo.marcar_clasificado("<s@fs>", k, "m")
    repo.marcar_clasificado("<p@g>", k, "m")
    repo.marcar_enviado("<s@fs>", ("fs",))
    repo.marcar_enviado("<p@g>", ("otra",))
    assert repo.dominios_conocidos() == frozenset({"fullstacklabs.co"})
    assert repo.postulaciones_del_dominio("FullStackLabs.co") == ("fs",)
    assert repo.postulaciones_del_dominio("gmail.com") == ()

    repo.guardar(
        CorreoGuardado(
            "<j@fs>",
            2,
            "jcorrea@fullstacklabs.co",
            datetime(2026, 11, 24, tzinfo=UTC),
            EstadoDeCorreo.FILTRADO,
            None,
            "x",
        )
    )
    assert repo.estado_de("<j@fs>") == "filtrado" and repo.estado_de("<no@x>") is None
    nuevo = guardado("<j@fs>", "jcorrea@fullstacklabs.co", EstadoDeCorreo.PENDIENTE)
    assert repo.reabrir(nuevo) and not repo.reabrir(nuevo)
    assert [c.message_id for c in repo.pendientes(10)] == ["<j@fs>"]
