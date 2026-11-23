"""API de IA (FastAPI): Avisos, Preguntar y Conexiones. Escucha solo en 127.0.0.1 (ADR 0010 y 0019)."""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from ia.infraestructura.config import Config, cargar_config

HOSTS = {"127.0.0.1", "localhost"}


def crear_app(config: Config | None = None) -> FastAPI:
    cfg = config or cargar_config()
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

    @app.get("/api/ia/salud")
    def salud() -> dict[str, bool]:
        return {"ok": True}

    return app


app = crear_app() if __name__ != "__main__" else None
