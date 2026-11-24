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
        c.execute(text("TRUNCATE ia.correo, ia.estado_vigia"))
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
