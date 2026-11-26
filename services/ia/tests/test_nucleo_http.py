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


def test_senal_con_varias_postulaciones_paso_y_cumplidos() -> None:
    from dataclasses import replace

    from ia.aplicacion.puertos import PasoParaNucleo

    cuerpos: list[dict[str, object]] = []

    def manejar(p: httpx.Request) -> httpx.Response:
        cuerpos.append(json.loads(p.content))
        return httpx.Response(
            201, json={"destino": "postulacion", "senal": {"aplicada": False}, "postulacion": {"estado": "x"}}
        )

    s = replace(
        SENAL,
        postulacion_id=None,
        postulacion_ids=("p1", "p2"),
        paso=PasoParaNucleo(
            "Completar el test", plazo="2026-11-30", enlace="https://x.test", mismo_que="s-real"
        ),
        pasos_cumplidos=(("viejo", 0.95),),
    )
    nucleo(manejar).registrar_senal(s)
    c = cuerpos[0]
    assert "postulacionId" not in c and c["postulacionIds"] == ["p1", "p2"]
    assert c["paso"] == {
        "descripcion": "Completar el test",
        "plazo": "2026-11-30",
        "enlace": "https://x.test",
        "mismoQue": "s-real",
    }
    assert c["pasosCumplidos"] == [{"id": "viejo", "confianza": 0.95}]


def test_contexto_y_registrar_paso() -> None:
    from ia.aplicacion.puertos import PasoParaNucleo

    pedidos: list[httpx.Request] = []

    def manejar(p: httpx.Request) -> httpx.Response:
        pedidos.append(p)
        if p.method == "GET" and p.url.path.endswith("/no"):
            return httpx.Response(404, json={})
        if p.method == "GET":
            return httpx.Response(
                200,
                json={
                    "id": "p1",
                    "empresa": "Lanek",
                    "titulo": "Backend",
                    "estado": "rechazado",
                    "pasos": [
                        {
                            "id": "s",
                            "descripcion": "Test",
                            "estado": "hecho",
                            "plazo": None,
                            "cierre": {"por": "ia", "en": "2026-11-23T10:00:00.000Z"},
                        }
                    ],
                    "senales": [{"recibidaEn": "2026-11-23T10:03:05.000Z", "resumen": "Te piden un test"}],
                },
            )
        return httpx.Response(201, json={"yaEstaba": False})

    n = nucleo(manejar)
    [c] = n.contexto(["p1", "no"])
    assert (
        c.estado == "rechazado" and c.pasos[0].cerrado_por == "ia" and c.pasos[0].cerrado_en == "2026-11-23"
    )
    assert c.senales == (("2026-11-23", "Te piden un test"),)
    assert n.registrar_paso(["p1"], PasoParaNucleo("Leer el mensaje"), "linkedin", "<m>#0#leer", None, "c1")
    cuerpo = json.loads(pedidos[-1].content)
    assert cuerpo == {
        "postulacionIds": ["p1"],
        "descripcion": "Leer el mensaje",
        "fuente": "linkedin",
        "referenciaExterna": "<m>#0#leer",
        "contactoRedId": "c1",
    }
