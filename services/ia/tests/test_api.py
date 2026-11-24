import logging
from datetime import UTC, datetime

import httpx
import pytest
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


def cliente_con_credenciales(
    llavero: LlaveroEnMemoria, correo_ok: bool = True, openai_ok: bool = True
) -> TestClient:
    app = crear_app(
        CFG,
        verificador({"tok-consola": "sesion", "tok-mcp": "mcp"}),
        EstadoFijo(),
        llavero,
        probar_correo=lambda u, c: None if correo_ok else "Gmail no aceptó",
        probar_openai=lambda k: None if openai_ok else "OpenAI no aceptó",
    )
    return TestClient(app, base_url="http://127.0.0.1:4400")


def test_credenciales_se_prueban_se_guardan_y_nunca_se_devuelven() -> None:
    from ia.aplicacion.puertos import TipoDeCredencial

    llavero = LlaveroEnMemoria()
    c = cliente_con_credenciales(llavero)
    h = {"Authorization": "Bearer tok-consola"}
    r = c.put(
        "/api/ia/credenciales/correo",
        json={"usuario": "Persona@Ejemplo.test", "clave": "abcd efgh ijkl mnop"},
        headers=h,
    )
    assert r.status_code == 200 and r.json() == {"configurado": True, "usuario": "pe•••••@ejemplo.test"}
    assert llavero.obtener(TipoDeCredencial.CORREO_CLAVE) == "abcdefghijklmnop"
    assert (
        c.put("/api/ia/credenciales/openai", json={"llave": "sk-" + "x" * 30}, headers=h).status_code == 200
    )
    vista = c.get("/api/ia/credenciales", headers=h).json()
    assert vista == {
        "correo": {"configurado": True, "usuario": "pe•••••@ejemplo.test"},
        "openai": {"configurado": True},
    }
    assert "abcdefghijklmnop" not in str(vista)
    assert c.delete("/api/ia/credenciales/openai", headers=h).status_code == 204
    assert llavero.obtener(TipoDeCredencial.OPENAI) is None


def test_credencial_rechazada_no_se_guarda_y_mcp_no_puede_cambiarlas() -> None:
    llavero = LlaveroEnMemoria()
    c = cliente_con_credenciales(llavero, correo_ok=False)
    r = c.put(
        "/api/ia/credenciales/correo",
        json={"usuario": "a@ejemplo.test", "clave": "abcdefghijklmnop"},
        headers={"Authorization": "Bearer tok-consola"},
    )
    assert r.status_code == 400 and r.json()["codigo"] == "CREDENCIAL_INVALIDA"
    assert (
        c.get("/api/ia/credenciales", headers={"Authorization": "Bearer tok-consola"}).json()["correo"][
            "configurado"
        ]
        is False
    )
    r = c.put(
        "/api/ia/credenciales/openai",
        json={"llave": "sk-" + "x" * 30},
        headers={"Authorization": "Bearer tok-mcp"},
    )
    assert r.status_code == 403


def test_los_secretos_no_salen_en_errores_ni_en_logs(caplog: pytest.LogCaptureFixture) -> None:
    """La contraseña de aplicación y la llave nunca vuelven en una respuesta ni quedan en un registro (W5)."""
    caplog.set_level(logging.DEBUG)
    clave_corta = "qwertyuiopasdfg"  # 15 letras: el cuerpo no pasa la validación
    clave_mala = "zxcvbnmlkjhgfdsa"  # 16 letras: Gmail (simulado) la rechaza
    llave_mala = "sk-" + "s" * 10  # muy corta
    llave_rechazada = "sk-" + "r" * 40  # OpenAI (simulado) la rechaza
    h = {"Authorization": "Bearer tok-consola"}
    c = cliente_con_credenciales(LlaveroEnMemoria(), correo_ok=False, openai_ok=False)
    respuestas = [
        c.put(
            "/api/ia/credenciales/correo", json={"usuario": "a@ejemplo.test", "clave": clave_corta}, headers=h
        ),
        c.put(
            "/api/ia/credenciales/correo", json={"usuario": "a@ejemplo.test", "clave": clave_mala}, headers=h
        ),
        c.put("/api/ia/credenciales/openai", json={"llave": llave_mala}, headers=h),
        c.put("/api/ia/credenciales/openai", json={"llave": llave_rechazada}, headers=h),
    ]
    assert [r.status_code for r in respuestas] == [400, 400, 400, 400]  # la validación también responde 400
    for secreto in (clave_corta, clave_mala, llave_mala, llave_rechazada):
        assert all(secreto not in r.text for r in respuestas), secreto
        assert secreto not in caplog.text, secreto


# ── Arriendos (docs/diseno/arriendos.md §7) ─────────────────────────────────


def test_leer_un_chat_de_whatsapp_no_usa_ia_y_dice_quien_habla() -> None:
    c = cliente()
    h = {"Authorization": "Bearer tok-consola"}
    chat = "[20/11/26, 10:15:03] Juan: Hola\n[20/11/26, 10:16:00] Ana: Sí, sigue disponible\n"
    r = c.post("/api/ia/arriendos/chat", json={"chat": chat}, headers=h)
    assert r.status_code == 200
    assert r.json()["autores"] == ["Juan", "Ana"] and r.json()["mensajes"] == 2
    malo = c.post("/api/ia/arriendos/chat", json={"chat": "no es un chat"}, headers=h)
    assert malo.status_code == 400 and malo.json()["campo"] == "chat"
    assert c.post("/api/ia/arriendos/chat", json={"chat": chat}).status_code == 401


def test_extraer_sin_llave_de_openai_lo_dice_y_pide_texto_o_chat() -> None:
    c = cliente()
    h = {"Authorization": "Bearer tok-consola"}
    assert c.post("/api/ia/arriendos/extraer", json={}, headers=h).status_code == 400
    r = c.post("/api/ia/arriendos/extraer", json={"texto": "Depto 2D en Ñuñoa"}, headers=h)
    assert r.status_code == 503 and r.json()["codigo"] == "IA_NO_DISPONIBLE"
