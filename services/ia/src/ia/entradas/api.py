"""API de IA (FastAPI): Conexiones, Avisos y Preguntar. Escucha solo en 127.0.0.1 (ADR 0010 y 0019)."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from ia.aplicacion.puertos import ConsultaDeEstado, Credenciales, estado_de
from ia.infraestructura.config import Config, cargar_config
from ia.infraestructura.llavero import Llavero
from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos
from ia.infraestructura.postgres.motor import crear_motor
from ia.infraestructura.verificador import VerificadorDeTokens

HOSTS = {"127.0.0.1", "localhost"}


def crear_app(
    config: Config | None = None,
    verificador: VerificadorDeTokens | None = None,
    estado: ConsultaDeEstado | None = None,
    credenciales: Credenciales | None = None,
) -> FastAPI:
    cfg = config or cargar_config()
    ver = verificador or VerificadorDeTokens(cfg.nucleo_url)
    consulta = estado or RepositorioPostgresDeCorreos(crear_motor(cfg.ia_database_url))
    llavero = credenciales or Llavero()
    app = FastAPI(
        title="Brecha · servicio con IA", version="1", docs_url="/docs", openapi_url="/openapi.json"
    )

    @app.middleware("http")
    async def host_y_origen(
        peticion: Request, siguiente: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        host = (peticion.headers.get("host") or "").rsplit(":", 1)[0].lower()
        if host not in HOSTS:
            return JSONResponse({"codigo": "NO_AUTENTICADO", "mensaje": "Host no permitido"}, status_code=401)
        origen = peticion.headers.get("origin")
        if origen is not None and origen != cfg.consola_origen:
            return JSONResponse(
                {"codigo": "NO_AUTENTICADO", "mensaje": "Origen no permitido"}, status_code=401
            )
        return await siguiente(peticion)

    @app.exception_handler(HTTPException)
    async def error_http(_: Request, e: HTTPException) -> JSONResponse:
        return JSONResponse(
            e.detail if isinstance(e.detail, dict) else {"codigo": "ERROR_INTERNO"}, status_code=e.status_code
        )

    def con_token(authorization: Annotated[str | None, Header()] = None) -> str:
        token = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else None
        tipo = ver.tipo(token)
        if tipo is None:
            raise HTTPException(401, {"codigo": "NO_AUTENTICADO", "mensaje": "Hace falta un token válido"})
        return tipo

    @app.get("/api/ia/salud")
    def salud() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/api/ia/conexiones")
    def conexiones(_: Annotated[str, Depends(con_token)]) -> dict[str, Any]:
        ahora = datetime.now(UTC)
        e = consulta.estado(ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0))
        cred = estado_de(llavero)
        return {
            "correo": {
                "configurado": cred.correo,
                "ultimaRevision": e.ultima_revision.isoformat() if e.ultima_revision else None,
                "ultimoError": e.ultimo_error_correo,
                "cadaMinutos": cfg.vigia_minutos,
            },
            "ia": {
                "proveedor": "openai",
                "configurado": cred.openai,
                "modelo": cfg.openai_modelo,
                "ultimoError": e.ultimo_error_ia,
                "enCola": e.en_cola,
                "clasificados": e.clasificados,
                "gastoMesUsd": round(e.gasto_mes_usd, 6),
                "llamadasMes": e.llamadas_mes,
            },
            "salida": [
                "Solo los correos de plataformas que pasan el filtro: "
                "un fragmento de hasta 4.000 caracteres va a OpenAI.",
                "El resto del correo no sale de tu máquina.",
            ],
        }

    return app


app = crear_app() if __name__ != "__main__" else None
