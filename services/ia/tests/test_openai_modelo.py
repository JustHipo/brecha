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
