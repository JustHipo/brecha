import os

import pytest
from sqlalchemy import text

from ia.aplicacion.puertos import FiltrosDeAvisos
from ia.dominio.aviso import Aviso
from ia.dominio.calce import Calce, Perfil, Requisito
from ia.infraestructura.config import cargar_config
from ia.infraestructura.postgres.avisos import RepositorioPostgresDeAvisos, RepositorioPostgresDePerfil
from ia.infraestructura.postgres.motor import crear_motor


@pytest.fixture
def motor():  # type: ignore[no-untyped-def]
    url = os.environ.get("IA_DATABASE_URL_PRUEBAS") or cargar_config().ia_database_url.replace(
        "/brecha", "/brecha_pruebas"
    )
    m = crear_motor(url)
    with m.begin() as c:
        c.execute(text("TRUNCATE ia.aviso, ia.perfil"))
    return m


def aviso(n: int, texto: str = "NestJS", modalidad: str = "remoto", usd: int | None = None) -> Aviso:
    return Aviso(
        f"https://ejemplo.test/a/{n}",
        f"Cargo {n}",
        "Ficticia",
        "otra",
        modalidad,
        "importado",
        texto,
        stack=("NestJS",),
        usd_mes=usd,
    )


def vector(*xs: float) -> list[float]:
    return list(xs) + [0.0] * (1536 - len(xs))


def test_guardar_es_idempotente_y_un_texto_nuevo_borra_el_analisis(motor) -> None:  # type: ignore[no-untyped-def]
    repo = RepositorioPostgresDeAvisos(motor)
    id1, nuevo = repo.guardar(aviso(1))
    assert nuevo
    repo.guardar_analisis(id1, [Requisito("NestJS", True, 2)], Calce(80, ("x",), ("NestJS",)), "m")
    repo.guardar_vector(id1, vector(1), "e")
    assert repo.guardar(aviso(1)) == (id1, False)
    g = repo.por_id(id1)
    assert (
        g is not None
        and g.requisitos == (Requisito("NestJS", True, 2),)
        and g.calce == Calce(80, ("x",), ("NestJS",))
    )
    assert repo.sin_vector(10) == []
    repo.guardar(aviso(1, "Ahora pide Python"))
    g = repo.por_id(id1)
    assert g is not None and g.requisitos is None
    assert [x.id for x in repo.sin_vector(10)] == [id1]


def test_listar_filtra_y_ordena_por_calce(motor) -> None:  # type: ignore[no-untyped-def]
    repo = RepositorioPostgresDeAvisos(motor)
    a, _ = repo.guardar(aviso(1, modalidad="remoto", usd=3000))
    b, _ = repo.guardar(aviso(2, modalidad="presencial"))
    repo.guardar_analisis(a, [], Calce(40, (), ()), "m")
    repo.guardar_analisis(b, [], Calce(90, (), ()), "m")
    assert [g.id for g in repo.listar(FiltrosDeAvisos())] == [b, a]
    assert [g.id for g in repo.listar(FiltrosDeAvisos(modalidad="remoto"))] == [a]
    assert [g.id for g in repo.listar(FiltrosDeAvisos(texto="nestjs", usd_minimo=2000))] == [a]
    assert [g.id for g in repo.listar(FiltrosDeAvisos(calce_minimo=50))] == [b]


def test_cercanos_por_coseno_con_filtros(motor) -> None:  # type: ignore[no-untyped-def]
    repo = RepositorioPostgresDeAvisos(motor)
    a, _ = repo.guardar(aviso(1))
    b, _ = repo.guardar(aviso(2, modalidad="presencial"))
    c, _ = repo.guardar(aviso(3))
    repo.guardar_vector(a, vector(1, 0), "e")
    repo.guardar_vector(b, vector(0.9, 0.1), "e")
    repo.guardar_vector(c, vector(0, 1), "e")
    cerca = repo.cercanos(vector(1, 0.05), 2, FiltrosDeAvisos())
    assert [g.id for g in cerca] == [a, b]
    assert cerca[0].distancia is not None and cerca[0].distancia < 0.01
    assert [g.id for g in repo.cercanos(vector(1, 0), 2, FiltrosDeAvisos(modalidad="remoto"))] == [a, c]
    assert repo.contar() == {"total": 3, "analizados": 0, "conVector": 3, "vinculados": 0}


def test_vinculo_y_perfil(motor) -> None:  # type: ignore[no-untyped-def]
    repo = RepositorioPostgresDeAvisos(motor)
    a, _ = repo.guardar(aviso(1))
    repo.vincular(a, "p1")
    repo.marcar_vinculo_enviado(a, "p1:80")
    g = repo.por_id(a)
    assert g is not None and (g.postulacion_id, g.vinculo_enviado) == ("p1", "p1:80")
    perfiles = RepositorioPostgresDePerfil(motor)
    assert perfiles.perfil() is None
    perfiles.guardar(Perfil({"NestJS": 2}, 2))
    perfiles.guardar(Perfil({"NestJS": 3, "Python": 1}, 3))
    assert perfiles.perfil() == Perfil({"NestJS": 3, "Python": 1}, 3)
