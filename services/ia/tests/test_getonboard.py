import httpx
import pytest

from ia.infraestructura.getonboard import CITA, GetOnBoard, aviso_de


def dato(n: int, **at: object) -> dict[str, object]:
    base: dict[str, object] = {
        "title": f"Backend NestJS {n}",
        "description": "<ul><li>NestJS</li><li>PostgreSQL</li></ul>",
        "functions": "<p>Construir APIs</p>",
        "remote_modality": "fully_remote",
        "countries": ["Chile"],
        "min_salary": 2000,
        "max_salary": 3000,
        "published_at": 1795469057,
        "company": {"data": {"attributes": {"name": "Ficticia"}}},
    }
    return {
        "id": f"backend-{n}",
        "attributes": {**base, **at},
        "links": {"public_url": f"https://www.getonbrd.com/jobs/backend-{n}"},
    }


def test_traduce_un_aviso_con_enlace_y_cita() -> None:
    a = aviso_de(dato(1))
    assert a.url == "https://www.getonbrd.com/jobs/backend-1"
    assert (a.empresa, a.plataforma, a.modalidad, a.origen) == (
        "Ficticia",
        "getonboard",
        "remoto",
        "getonboard",
    )
    assert a.cita == CITA
    assert a.sueldo == "USD 2000 - 3000/mes" and a.usd_mes == 3000
    assert "Construir APIs" in a.texto and "- NestJS" in a.texto
    assert aviso_de(dato(2, remote_modality="hybrid")).modalidad == "hibrido"


def test_pagina_hasta_el_maximo_y_espera_si_responde_429(monkeypatch: pytest.MonkeyPatch) -> None:
    pedidos: list[httpx.Request] = []
    vez = {"429": True}

    def manejar(p: httpx.Request) -> httpx.Response:
        pedidos.append(p)
        pagina = int(p.url.params["page"])
        if pagina == 2 and vez["429"]:
            vez["429"] = False
            return httpx.Response(429)
        datos = [dato(pagina * 100 + i) for i in range(20)]
        return httpx.Response(200, json={"data": datos, "meta": {"page": pagina, "total_pages": 5}})

    cliente = httpx.Client(base_url="https://www.getonbrd.com", transport=httpx.MockTransport(manejar))
    monkeypatch.setattr("ia.infraestructura.getonboard.time.sleep", lambda s: None)
    avisos = GetOnBoard(cliente, pausa_s=0).buscar("nestjs", 30)
    assert len(avisos) == 30
    assert [p.url.params["page"] for p in pedidos] == ["1", "2", "2"]
    assert pedidos[0].url.params["query"] == "nestjs"
