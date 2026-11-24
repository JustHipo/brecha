import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from ia.dominio.asociacion import PostulacionConocida
from ia.entradas.api import crear_app
from ia.entradas.servicios import Servicios
from ia.infraestructura.config import cargar_config
from ia.infraestructura.postgres.motor import crear_motor
from tests.dobles_avisos import ModeloFalso, NucleoFalso
from tests.test_api import CFG, EstadoFijo, verificador
from tests.test_credenciales import LlaveroEnMemoria

H = {"Authorization": "Bearer tok-consola"}


@pytest.fixture
def entorno():  # type: ignore[no-untyped-def]
    url = os.environ.get("IA_DATABASE_URL_PRUEBAS") or cargar_config().ia_database_url.replace(
        "/brecha", "/brecha_pruebas"
    )
    motor = crear_motor(url)
    with motor.begin() as c:
        c.execute(text("TRUNCATE ia.aviso, ia.perfil, ia.traza"))
    nucleo = NucleoFalso(
        [PostulacionConocida("p9", "Ficticia", "Backend", "otra", True, "https://ejemplo.test/x")]
    )
    s = Servicios(CFG, LlaveroEnMemoria(), motor, modelo=ModeloFalso(), nucleo=nucleo)
    app = crear_app(CFG, verificador({"tok-consola": "sesion"}), EstadoFijo(), LlaveroEnMemoria(), s)
    return TestClient(app, base_url="http://127.0.0.1:4400"), nucleo


PEGADO = {
    "url": "https://ejemplo.test/x",
    "titulo": "Backend NestJS",
    "empresa": "Ficticia",
    "texto": "Buscamos NestJS y PostgreSQL, deseable AWS. Trabajo remoto.",
    "modalidad": "remoto",
}


def test_rutas_piden_token(entorno) -> None:  # type: ignore[no-untyped-def]
    cliente, _ = entorno
    assert cliente.get("/api/ia/avisos").status_code == 401
    assert cliente.post("/api/ia/preguntas", json={"pregunta": "hola?"}).status_code == 401


def test_pegar_analiza_liga_y_calcula_con_el_perfil(entorno) -> None:  # type: ignore[no-untyped-def]
    cliente, nucleo = entorno
    r = cliente.put(
        "/api/ia/perfil", json={"herramientas": {"NestJS": 2, "PostgreSQL": 1}, "anosTotales": 2}, headers=H
    )
    assert r.status_code == 200
    creado = cliente.post("/api/ia/avisos", json=PEGADO, headers=H)
    assert creado.status_code == 201
    id = creado.json()["id"]
    d = cliente.get(f"/api/ia/avisos/{id}", headers=H).json()  # la tarea en segundo plano ya corrió
    assert d["analizado"] and d["calce"] == 80  # NestJS y PostgreSQL (2+2) de 5; falta AWS deseable
    assert d["brechas"] == ["AWS"]
    assert d["origen"] == "manual" and d["cita"] == "Pegado a mano"
    assert d["postulacionId"] == "p9"
    assert nucleo.enviados == [("p9", id, 0.8)]
    lista = cliente.get("/api/ia/avisos?modalidad=remoto", headers=H).json()
    assert [a["id"] for a in lista["items"]] == [id]
    assert lista["conteo"]["total"] == 1


def test_aviso_invalido_y_desconocido(entorno) -> None:  # type: ignore[no-untyped-def]
    cliente, _ = entorno
    r = cliente.post("/api/ia/avisos", json={**PEGADO, "url": "sin-esquema"}, headers=H)
    assert r.status_code == 400 and r.json()["codigo"] == "DATO_INVALIDO"
    assert cliente.get("/api/ia/avisos/no-existe", headers=H).status_code == 404


def test_cambiar_el_perfil_recalcula(entorno) -> None:  # type: ignore[no-untyped-def]
    cliente, _ = entorno
    id = cliente.post("/api/ia/avisos", json=PEGADO, headers=H).json()["id"]
    assert cliente.get(f"/api/ia/avisos/{id}", headers=H).json()["calce"] is None  # sin perfil
    r = cliente.put(
        "/api/ia/perfil",
        json={"herramientas": {"NestJS": 2, "PostgreSQL": 2, "AWS": 1}, "anosTotales": 3},
        headers=H,
    )
    assert r.json()["recalculados"] == 1
    assert cliente.get(f"/api/ia/avisos/{id}", headers=H).json()["calce"] == 100
    assert cliente.get("/api/ia/perfil", headers=H).json()["anosTotales"] == 3


def test_preguntar_devuelve_los_avisos_citados(entorno) -> None:  # type: ignore[no-untyped-def]
    cliente, _ = entorno
    id = cliente.post("/api/ia/avisos", json=PEGADO, headers=H).json()["id"]
    r = cliente.post("/api/ia/preguntas", json={"pregunta": "¿Qué avisos piden NestJS?"}, headers=H)
    assert r.status_code == 200
    cuerpo = r.json()
    assert [a["id"] for a in cuerpo["citados"]] == [id]
    assert cuerpo["citados"][0]["url"] == "https://ejemplo.test/x"


def test_vincular_a_mano(entorno) -> None:  # type: ignore[no-untyped-def]
    cliente, nucleo = entorno
    otro = {**PEGADO, "url": "https://ejemplo.test/otro"}
    id = cliente.post("/api/ia/avisos", json=otro, headers=H).json()["id"]
    r = cliente.post(f"/api/ia/avisos/{id}/vincular", json={"postulacionId": "p2"}, headers=H)
    assert r.status_code == 200 and r.json()["postulacionId"] == "p2"
    assert ("p2", id, None) in nucleo.enviados
