from fastapi.testclient import TestClient

from ia.entradas.api import crear_app
from ia.infraestructura.config import Config

CFG = Config(ia_database_url="postgresql+psycopg://x@127.0.0.1:1/x")


def cliente() -> TestClient:
    return TestClient(crear_app(CFG), base_url="http://127.0.0.1:4400")


def test_salud() -> None:
    r = cliente().get("/api/ia/salud")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_rechaza_host_ajeno() -> None:
    r = cliente().get("/api/ia/salud", headers={"host": "atacante.test"})
    assert r.status_code == 401
    assert r.json()["mensaje"] == "Host no permitido"


def test_rechaza_origen_ajeno() -> None:
    r = cliente().get("/api/ia/salud", headers={"origin": "https://otro.test"})
    assert r.status_code == 401
    assert cliente().get("/api/ia/salud", headers={"origin": "http://localhost:4200"}).status_code == 200
