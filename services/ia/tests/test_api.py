from datetime import UTC, datetime

import httpx
from fastapi.testclient import TestClient

from ia.aplicacion.puertos import EstadoDelServicio
from ia.entradas.api import crear_app
from ia.infraestructura.config import Config
from ia.infraestructura.verificador import VerificadorDeTokens
from tests.test_credenciales import LlaveroEnMemoria

CFG = Config(ia_database_url="postgresql+psycopg://x@127.0.0.1:1/x")


class EstadoFijo:
    def estado(self, desde_mes: datetime) -> EstadoDelServicio:
        return EstadoDelServicio(
            datetime(2026, 11, 24, 10, tzinfo=UTC), None, "cuota: sin saldo", 3, 27, 0.00445, 27
        )


def verificador(validos: dict[str, str]) -> VerificadorDeTokens:
    def manejar(p: httpx.Request) -> httpx.Response:
        tok = p.headers.get("Authorization", "")[7:]
        return (
            httpx.Response(200, json={"tipo": validos[tok]})
            if tok in validos
            else httpx.Response(401, json={})
        )

    return VerificadorDeTokens(
        "http://127.0.0.1:4300",
        httpx.Client(base_url="http://127.0.0.1:4300", transport=httpx.MockTransport(manejar)),
    )


def cliente() -> TestClient:
    app = crear_app(CFG, verificador({"tok-consola": "sesion"}), EstadoFijo(), LlaveroEnMemoria())
    return TestClient(app, base_url="http://127.0.0.1:4400")


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


def test_conexiones_pide_un_token_que_el_nucleo_reconozca() -> None:
    assert cliente().get("/api/ia/conexiones").status_code == 401
    assert (
        cliente().get("/api/ia/conexiones", headers={"Authorization": "Bearer inventado"}).status_code == 401
    )
    r = cliente().get("/api/ia/conexiones", headers={"Authorization": "Bearer tok-consola"})
    assert r.status_code == 200
    d = r.json()
    assert d["correo"] == {
        "configurado": False,
        "ultimaRevision": "2026-11-24T10:00:00+00:00",
        "ultimoError": None,
        "cadaMinutos": 15,
    }
    assert (
        d["ia"]["ultimoError"] == "cuota: sin saldo"
        and d["ia"]["enCola"] == 3
        and d["ia"]["gastoMesUsd"] == 0.00445
    )
    assert d["ia"]["modelo"] == "gpt-6-luna"


def test_verificador_usa_cache_y_no_confia_si_el_nucleo_no_responde() -> None:
    llamadas: list[str] = []
    instante = [0.0]

    def manejar(p: httpx.Request) -> httpx.Response:
        llamadas.append(p.headers["Authorization"])
        return httpx.Response(200, json={"tipo": "sesion"})

    v = VerificadorDeTokens(
        "http://n",
        httpx.Client(base_url="http://n", transport=httpx.MockTransport(manejar)),
        lambda: instante[0],
    )
    assert v.tipo("t") == "sesion" and v.tipo("t") == "sesion" and len(llamadas) == 1
    instante[0] = 61
    v.tipo("t")
    assert len(llamadas) == 2
    assert v.tipo(None) is None

    def cae(p: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no")

    caido = VerificadorDeTokens(
        "http://n", httpx.Client(base_url="http://n", transport=httpx.MockTransport(cae))
    )
    assert caido.tipo("t") is None
