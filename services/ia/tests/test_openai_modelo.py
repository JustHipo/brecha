import json

import httpx2
import pytest
from openai import OpenAI

from ia.aplicacion.puertos import ErrorDeModelo
from ia.infraestructura.openai_modelo import ModeloOpenAI

URL = "https://api.openai.com/v1/chat/completions"


class Simulado:
    """Cliente de OpenAI con un transporte falso: ningún pedido sale a la red (el SDK 3 usa httpx2)."""

    def __init__(self, respuesta: "httpx2.Response") -> None:
        self.respuesta = respuesta
        self.pedidos: list[httpx2.Request] = []

    def modelo(self) -> ModeloOpenAI:
        def manejar(pedido: httpx2.Request) -> httpx2.Response:
            self.pedidos.append(pedido)
            return self.respuesta

        cliente = OpenAI(
            api_key="sk-prueba",
            max_retries=0,
            http_client=httpx2.Client(transport=httpx2.MockTransport(manejar)),
        )
        return ModeloOpenAI("sk-prueba", "gpt-6-luna", cliente=cliente)


def respuesta(contenido: dict[str, object]) -> httpx2.Response:
    return httpx2.Response(
        200,
        json={
            "id": "chatcmpl-x",
            "object": "chat.completion",
            "created": 0,
            "model": "gpt-6-luna",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": json.dumps(contenido)},
                }
            ],
            "usage": {"prompt_tokens": 700, "completion_tokens": 60, "total_tokens": 760},
        },
    )


SALIDA = {
    "es_postulacion": True,
    "plataforma": "trabajando",
    "empresa": "Ficticia",
    "cargo": "Backend",
    "estado_sugerido": "rechazado",
    "resumen": "No continúan con el proceso",
    "confianza": 0.96,
}


def test_clasifica_con_salida_estructurada_y_no_manda_el_correo_completo_del_remitente() -> None:
    sim = Simulado(respuesta(SALIDA))
    c, uso = sim.modelo().clasificar_correo(
        "persona.secreta@empresa.test", "Resultado", "No continuaremos", "trabajando"
    )
    assert c.estado_sugerido == "rechazado" and c.confianza == 0.96 and c.empresa == "Ficticia"
    assert (uso.modelo, uso.tokens_entrada, uso.tokens_salida) == ("gpt-6-luna", 700, 60)
    assert str(sim.pedidos[0].url) == URL
    cuerpo = json.loads(sim.pedidos[0].content)
    assert cuerpo["model"] == "gpt-6-luna"
    assert cuerpo["response_format"]["type"] == "json_schema"
    enviado = json.dumps(cuerpo["messages"])
    assert "persona.secreta" not in enviado and "empresa.test" in enviado


def test_ninguno_o_no_postulacion_no_sugiere_estado() -> None:
    c, _ = (
        Simulado(respuesta({**SALIDA, "estado_sugerido": "ninguno"}))
        .modelo()
        .clasificar_correo("a@b.test", "x", "y", None)
    )
    assert c.estado_sugerido is None and c.es_postulacion


@pytest.mark.parametrize(
    ("status", "cuerpo", "tipo", "detiene"),
    [
        (
            429,
            {
                "error": {
                    "message": "You exceeded your current quota",
                    "type": "insufficient_quota",
                    "code": "insufficient_quota",
                }
            },
            "cuota",
            True,
        ),
        (
            429,
            {"error": {"message": "Rate limit reached", "type": "requests", "code": "rate_limit_exceeded"}},
            "limite",
            True,
        ),
        (
            401,
            {
                "error": {
                    "message": "Incorrect API key",
                    "type": "invalid_request_error",
                    "code": "invalid_api_key",
                }
            },
            "credencial",
            True,
        ),
        (
            400,
            {"error": {"message": "bad", "type": "invalid_request_error", "code": None}},
            "respuesta_invalida",
            False,
        ),
    ],
)
def test_errores_tipados(status: int, cuerpo: dict[str, object], tipo: str, detiene: bool) -> None:
    with pytest.raises(ErrorDeModelo) as e:
        Simulado(httpx2.Response(status, json=cuerpo)).modelo().clasificar_correo("a@b.test", "x", "y", None)
    assert (e.value.tipo, e.value.detiene) == (tipo, detiene)


def test_una_respuesta_fuera_del_dominio_es_respuesta_invalida() -> None:
    with pytest.raises(ErrorDeModelo) as e:
        Simulado(respuesta({**SALIDA, "confianza": 0.5, "resumen": "   "})).modelo().clasificar_correo(
            "a@b.test", "x", "y", None
        )
    assert e.value.tipo == "respuesta_invalida"


def test_analizar_aviso_devuelve_requisitos() -> None:
    from ia.dominio.aviso import Aviso
    from ia.dominio.calce import Requisito

    s = Simulado(
        respuesta(
            {
                "requisitos": [
                    {"nombre": "NestJS", "obligatorio": True, "anos": 2},
                    {"nombre": " ", "obligatorio": False, "anos": None},
                    {"nombre": "AWS", "obligatorio": False, "anos": None},
                ],
                "anos_totales": 3,
            }
        )
    )
    a = Aviso("https://ejemplo.test/1", "Backend", "Ficticia", "otra", "remoto", "manual", "NestJS 2 años")
    reqs, uso = s.modelo().analizar_aviso(a)
    assert reqs == [Requisito("NestJS", True, 2), Requisito("AWS", False, None)]
    assert uso.tokens_entrada == 700
    assert "NestJS 2 años" in s.pedidos[0].content.decode()


def test_embeber_ordena_por_indice() -> None:
    cuerpo = {
        "object": "list",
        "model": "text-embedding-3-small",
        "data": [
            {"object": "embedding", "index": 1, "embedding": [0.2]},
            {"object": "embedding", "index": 0, "embedding": [0.1]},
        ],
        "usage": {"prompt_tokens": 12, "total_tokens": 12},
    }
    s = Simulado(httpx2.Response(200, json=cuerpo))
    vectores, uso = s.modelo().embeber(["a", "b"])
    assert vectores == [[0.1], [0.2]]
    assert uso.tokens_entrada == 12
    assert s.pedidos[0].url.path.endswith("/embeddings")


def test_responder_devuelve_texto_y_citas() -> None:
    from ia.aplicacion.puertos import AvisoParaResponder

    s = Simulado(respuesta({"respuesta": "Backend en Ficticia", "citados": ["a1"]}))
    texto, citados, _ = s.modelo().responder(
        "¿Qué piden?", [AvisoParaResponder("a1", "Backend", "Ficticia", "remoto", None, ("NestJS",), "texto")]
    )
    assert (texto, citados) == ("Backend en Ficticia", ["a1"])
    assert "[id: a1]" in s.pedidos[0].content.decode()
