import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from ia.aplicacion.puertos import NucleoNoDisponible, SenalParaNucleo
from ia.infraestructura.nucleo_http import NucleoHttp, leer_token

SENAL = SenalParaNucleo(
    "<m@x>",
    "p1",
    "linkedin",
    "r",
    "rechazado",
    0.95,
    datetime(2026, 11, 20, tzinfo=UTC),
    "a@b.test",
    "s",
    "F",
    "B",
)


def nucleo(manejar) -> NucleoHttp:  # type: ignore[no-untyped-def]
    return NucleoHttp(
        "http://127.0.0.1:4300",
        "tok",
        httpx.Client(base_url="http://127.0.0.1:4300", transport=httpx.MockTransport(manejar)),
    )


def test_lista_postulaciones_paginando_con_el_token() -> None:
    pedidos: list[httpx.Request] = []

    def manejar(p: httpx.Request) -> httpx.Response:
        pedidos.append(p)
        offset = int(p.url.params["offset"])
        items = [
            {
                "id": f"p{offset}",
                "empresa": "F",
                "titulo": "B",
                "plataforma": "linkedin",
                "estado": "rechazado" if offset else "postulado",
            }
        ]
        return httpx.Response(200, json={"items": items, "total": 2})

    r = nucleo(manejar).postulaciones()
    assert [(p.id, p.activa) for p in r] == [("p0", True), ("p1", False)]
    assert pedidos[0].headers["Authorization"] == "Bearer tok"


def test_registra_senal_y_traduce_repetida() -> None:
    cuerpos: list[dict[str, object]] = []

    def manejar(p: httpx.Request) -> httpx.Response:
        cuerpos.append(json.loads(p.content))
        if len(cuerpos) == 2:
            return httpx.Response(409, json={"codigo": "YA_EXISTE", "mensaje": "ya"})
        return httpx.Response(
            201,
            json={
                "destino": "postulacion",
                "senal": {"aplicada": True},
                "postulacion": {"estado": "rechazado"},
            },
        )

    n = nucleo(manejar)
    assert n.registrar_senal(SENAL).aplicada is True
    assert n.registrar_senal(SENAL).destino == "repetida"
    assert (
        cuerpos[0]["fuente"] == "correo"
        and cuerpos[0]["postulacionId"] == "p1"
        and cuerpos[0]["referenciaExterna"] == "<m@x>"
    )


def test_nucleo_caido_o_error_raro() -> None:
    def cae(p: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no")

    with pytest.raises(NucleoNoDisponible):
        nucleo(cae).postulaciones()
    with pytest.raises(NucleoNoDisponible):
        nucleo(lambda p: httpx.Response(500, json={})).registrar_senal(SENAL)


def test_token_ausente(tmp_path: Path) -> None:
    with pytest.raises(NucleoNoDisponible):
        leer_token(tmp_path)
    (tmp_path / "token-servicio").write_text("abc\n")
    assert leer_token(tmp_path) == "abc"


def test_aviso_de_lee_la_foto_del_aviso_de_la_postulacion() -> None:
    def manejar(p: httpx.Request) -> httpx.Response:
        if p.url.path.endswith("/p404"):
            return httpx.Response(404, json={"codigo": "NO_ENCONTRADO"})
        aviso = {
            "url": "https://ejemplo.test/a",
            "titulo": "Práctica",
            "empresa": "F",
            "plataforma": "otra",
            "modalidad": "presencial",
            "ubicacion": "",
            "cierre": "2026-12-15",
            "stack": ["Python"],
            "requisitos": "Inglés",
            "sueldoPublicado": "CLP 150.000",
        }
        return httpx.Response(200, json={"id": "p1", "aviso": aviso})

    a = nucleo(manejar).aviso_de("p1")
    assert a is not None
    assert (a.stack, a.requisitos, a.sueldo_publicado, a.ubicacion) == (
        ("Python",),
        "Inglés",
        "CLP 150.000",
        None,
    )
    assert nucleo(manejar).aviso_de("p404") is None
