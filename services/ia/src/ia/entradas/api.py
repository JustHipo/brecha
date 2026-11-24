"""API de IA (FastAPI): Conexiones, Avisos y Preguntar. Escucha solo en 127.0.0.1 (ADR 0010 y 0019)."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from openai import OpenAI
from pydantic import BaseModel, Field

from ia.aplicacion.puertos import (
    AvisoGuardado,
    ConsultaDeEstado,
    Credenciales,
    FiltrosDeAvisos,
    NucleoNoDisponible,
    TipoDeCredencial,
    estado_de,
)
from ia.dominio.aviso import Aviso, AvisoInvalido
from ia.dominio.calce import Perfil
from ia.entradas.servicios import Servicios
from ia.infraestructura.config import Config, cargar_config
from ia.infraestructura.imap import LectorImap
from ia.infraestructura.llavero import Llavero
from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos
from ia.infraestructura.postgres.motor import crear_motor
from ia.infraestructura.verificador import VerificadorDeTokens

HOSTS = {"127.0.0.1", "localhost"}

Plataforma = Literal[
    "linkedin", "trabajando", "getonboard", "computrabajo", "chiletrabajos", "indeed", "sitio_empresa", "otra"
]


class AvisoPegado(BaseModel):
    url: str = Field(max_length=2000)
    titulo: str = Field(min_length=1, max_length=300)
    empresa: str = Field(min_length=1, max_length=200)
    texto: str = Field(min_length=20, max_length=20000)
    plataforma: Plataforma = "otra"
    modalidad: Literal["remoto", "hibrido", "presencial", "no_indica"] = "no_indica"
    stack: list[str] = Field(default_factory=list, max_length=40)


class Busqueda(BaseModel):
    consulta: str = Field(min_length=2, max_length=100)
    maximo: int = Field(default=40, ge=1, le=100)


class Vinculo(BaseModel):
    postulacionId: str = Field(min_length=1, max_length=36)


class PerfilEntrada(BaseModel):
    herramientas: dict[str, float] = Field(max_length=200)
    anosTotales: float = Field(ge=0, le=60)


class PreguntaEntrada(BaseModel):
    pregunta: str = Field(min_length=3, max_length=500)


class CredencialCorreo(BaseModel):
    usuario: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=320)
    clave: str = Field(min_length=16, max_length=64)


class CredencialOpenAI(BaseModel):
    llave: str = Field(pattern=r"^sk-", min_length=20, max_length=300)


def enmascarar(correo: str) -> str:
    nombre, _, dominio = correo.partition("@")
    return f"{nombre[:2]}{'•' * max(len(nombre) - 2, 1)}@{dominio}"


def _probar_correo(usuario: str, clave: str) -> str | None:
    """Abre la carpeta en solo lectura y la cierra: no marca nada."""
    lector = LectorImap(usuario, clave)
    try:
        lector.uidvalidity()
        return None
    except Exception as e:
        return f"Gmail no aceptó el correo y la contraseña de aplicación ({type(e).__name__})"
    finally:
        lector.cerrar()


def _probar_openai(llave: str) -> str | None:
    try:
        OpenAI(api_key=llave, timeout=20, max_retries=0).models.list()
        return None
    except Exception as e:
        return f"OpenAI no aceptó la llave ({type(e).__name__})"


def vista_aviso(g: AvisoGuardado, detalle: bool = False) -> dict[str, Any]:
    a = g.aviso
    v: dict[str, Any] = {
        "id": g.id,
        "url": a.url,
        "titulo": a.titulo,
        "empresa": a.empresa,
        "plataforma": a.plataforma,
        "modalidad": a.modalidad,
        "ubicacion": a.ubicacion,
        "origen": a.origen,
        "cita": a.cita,
        "stack": list(a.stack),
        "sueldo": a.sueldo,
        "publicadoEn": a.publicado_en.isoformat() if a.publicado_en else None,
        "analizado": g.requisitos is not None,
        "calce": g.calce.puntaje if g.calce else None,
        "brechas": list(g.calce.brechas) if g.calce else [],
        "postulacionId": g.postulacion_id,
    }
    if detalle:
        v["texto"] = a.texto
        v["cumple"] = list(g.calce.cumple) if g.calce else []
        v["requisitos"] = [
            {"nombre": r.nombre, "obligatorio": r.obligatorio, "anos": r.anos} for r in (g.requisitos or ())
        ]
    return v


def crear_app(
    config: Config | None = None,
    verificador: VerificadorDeTokens | None = None,
    estado: ConsultaDeEstado | None = None,
    credenciales: Credenciales | None = None,
    servicios: Servicios | None = None,
    probar_correo: Callable[[str, str], str | None] | None = None,
    probar_openai: Callable[[str], str | None] | None = None,
) -> FastAPI:
    cfg = config or cargar_config()
    ver = verificador or VerificadorDeTokens(cfg.nucleo_url)
    consulta = estado or RepositorioPostgresDeCorreos(crear_motor(cfg.ia_database_url))
    llavero = credenciales or Llavero()
    _s: list[Servicios] = [servicios] if servicios else []

    def srv() -> Servicios:
        if not _s:
            _s.append(Servicios(cfg, llavero))
        return _s[0]

    app = FastAPI(
        title="Brecha · servicio con IA", version="1", docs_url="/docs", openapi_url="/openapi.json"
    )

    # En desarrollo la consola se abre como localhost o 127.0.0.1; en la app, el origen es el núcleo.
    origenes = {cfg.consola_origen, cfg.consola_origen.replace("localhost", "127.0.0.1"), cfg.nucleo_url}

    @app.middleware("http")
    async def host_y_origen(
        peticion: Request, siguiente: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        host = (peticion.headers.get("host") or "").rsplit(":", 1)[0].lower()
        if host not in HOSTS:
            return JSONResponse({"codigo": "NO_AUTENTICADO", "mensaje": "Host no permitido"}, status_code=401)
        origen = peticion.headers.get("origin")
        if origen is not None and origen not in origenes:
            return JSONResponse(
                {"codigo": "NO_AUTENTICADO", "mensaje": "Origen no permitido"}, status_code=401
            )
        return await siguiente(peticion)

    @app.exception_handler(RequestValidationError)
    async def error_de_validacion(_: Request, e: RequestValidationError) -> JSONResponse:
        """Mismo formato que el núcleo: {codigo, mensaje, campo}."""
        primero = e.errors()[0] if e.errors() else {}
        campo = ".".join(str(x) for x in primero.get("loc", ())[1:]) or None
        return JSONResponse(
            {"codigo": "VALIDACION", "mensaje": str(primero.get("msg", "Datos inválidos")), "campo": campo},
            status_code=400,
        )

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
                "Solo los correos que pasan el filtro: un fragmento de hasta 4.000 caracteres va a OpenAI, "
                "con el dominio del remitente y nunca su dirección.",
                "El resto del correo no sale de tu máquina.",
                "El texto de cada aviso va a OpenAI una vez, para sacar sus requisitos y su vector.",
                "Tus preguntas en Preguntar van a OpenAI junto con los 8 avisos más cercanos.",
                "Tu perfil y tus postulaciones no salen: el calce se calcula en tu máquina.",
                "Las búsquedas de Get on Board van a su API pública (solo el texto que buscas).",
            ],
        }

    # ── Credenciales desde Ajustes (F3): se prueban antes de guardarlas y nunca se devuelven ──

    def solo_la_persona(tipo: Annotated[str, Depends(con_token)]) -> str:
        if tipo in {"mcp", "servicio"}:
            raise HTTPException(
                403, {"codigo": "PROHIBIDO", "mensaje": "Las credenciales solo se cambian desde la consola"}
            )
        return tipo

    @app.get("/api/ia/credenciales")
    def ver_credenciales(_: Annotated[str, Depends(con_token)]) -> dict[str, Any]:
        usuario = llavero.obtener(TipoDeCredencial.CORREO_USUARIO)
        e = estado_de(llavero)
        return {
            "correo": {"configurado": e.correo, "usuario": enmascarar(usuario) if usuario else None},
            "openai": {"configurado": e.openai},
        }

    @app.put("/api/ia/credenciales/correo")
    def guardar_correo(
        cuerpo: CredencialCorreo, _: Annotated[str, Depends(solo_la_persona)]
    ) -> dict[str, Any]:
        usuario = cuerpo.usuario.strip().lower()
        clave = cuerpo.clave.replace(" ", "")
        error = (probar_correo or _probar_correo)(usuario, clave)
        if error:
            raise HTTPException(400, {"codigo": "CREDENCIAL_INVALIDA", "mensaje": error, "campo": "clave"})
        llavero.guardar(TipoDeCredencial.CORREO_USUARIO, usuario)
        llavero.guardar(TipoDeCredencial.CORREO_CLAVE, clave)
        return {"configurado": True, "usuario": enmascarar(usuario)}

    @app.put("/api/ia/credenciales/openai")
    def guardar_openai(
        cuerpo: CredencialOpenAI, _: Annotated[str, Depends(solo_la_persona)]
    ) -> dict[str, Any]:
        llave = cuerpo.llave.strip()
        error = (probar_openai or _probar_openai)(llave)
        if error:
            raise HTTPException(400, {"codigo": "CREDENCIAL_INVALIDA", "mensaje": error, "campo": "llave"})
        llavero.guardar(TipoDeCredencial.OPENAI, llave)
        return {"configurado": True}

    @app.delete("/api/ia/credenciales/{tipo}", status_code=204)
    def borrar_credencial(
        tipo: Literal["correo", "openai"], _: Annotated[str, Depends(solo_la_persona)]
    ) -> Response:
        tipos = (
            [TipoDeCredencial.CORREO_USUARIO, TipoDeCredencial.CORREO_CLAVE]
            if tipo == "correo"
            else [TipoDeCredencial.OPENAI]
        )
        for t in tipos:
            llavero.borrar(t)
        return Response(status_code=204)

    # ── Avisos, perfil y Preguntar (F2-09 a F2-12) ─────────────────────────────

    @app.get("/api/ia/avisos")
    def listar_avisos(
        _: Annotated[str, Depends(con_token)],
        texto: str | None = None,
        modalidad: str | None = None,
        plataforma: str | None = None,
        calceMinimo: Annotated[int | None, Query(ge=0, le=100)] = None,
        limite: Annotated[int, Query(ge=1, le=500)] = 200,
    ) -> dict[str, Any]:
        f = FiltrosDeAvisos(texto, modalidad, plataforma, calceMinimo, None, limite)
        s = srv()
        return {"items": [vista_aviso(g) for g in s.avisos.listar(f)], "conteo": s.avisos.contar()}

    @app.get("/api/ia/avisos/{id}")
    def ver_aviso(id: str, _: Annotated[str, Depends(con_token)]) -> dict[str, Any]:
        g = srv().avisos.por_id(id)
        if g is None:
            raise HTTPException(404, {"codigo": "NO_ENCONTRADO", "mensaje": "No existe ese aviso"})
        return vista_aviso(g, detalle=True)

    @app.post("/api/ia/avisos", status_code=201)
    def pegar_aviso(
        cuerpo: AvisoPegado, tareas: BackgroundTasks, _: Annotated[str, Depends(con_token)]
    ) -> dict[str, Any]:
        try:
            a = Aviso(
                url=cuerpo.url.strip(),
                titulo=cuerpo.titulo.strip(),
                empresa=cuerpo.empresa.strip(),
                plataforma=cuerpo.plataforma,
                modalidad=cuerpo.modalidad,
                origen="manual",
                texto=cuerpo.texto.strip(),
                stack=tuple(cuerpo.stack),
                cita="Pegado a mano",
            )
        except AvisoInvalido as e:
            raise HTTPException(400, {"codigo": "VALIDACION", "mensaje": str(e)}) from e
        s = srv()
        id, _nuevo = s.avisos.guardar(a)
        tareas.add_task(s.procesar_avisos)
        g = s.avisos.por_id(id)
        assert g is not None
        return vista_aviso(g, detalle=True)

    @app.post("/api/ia/avisos/buscar")
    def buscar_avisos(
        cuerpo: Busqueda, tareas: BackgroundTasks, _: Annotated[str, Depends(con_token)]
    ) -> dict[str, Any]:
        s = srv()
        r = s.buscar_getonboard([cuerpo.consulta.strip()], cuerpo.maximo)
        if r["nuevos"]:
            tareas.add_task(s.procesar_avisos)
        return r

    @app.post("/api/ia/avisos/procesar", status_code=202)
    def procesar_avisos(tareas: BackgroundTasks, _: Annotated[str, Depends(con_token)]) -> dict[str, bool]:
        """Trae del núcleo los avisos de las postulaciones nuevas (por ejemplo, recién importadas por CSV),
        los analiza y liga, sin esperar la vuelta del vigía (docs/diseno/csv.md §5)."""
        tareas.add_task(srv().procesar_avisos)
        return {"encolado": True}

    @app.post("/api/ia/avisos/{id}/vincular")
    def vincular_aviso(id: str, cuerpo: Vinculo, _: Annotated[str, Depends(con_token)]) -> dict[str, Any]:
        s = srv()
        g = s.avisos.por_id(id)
        if g is None:
            raise HTTPException(404, {"codigo": "NO_ENCONTRADO", "mensaje": "No existe ese aviso"})
        s.avisos.vincular(id, cuerpo.postulacionId)
        try:
            calce = g.calce.puntaje if g.calce else None
            s.nucleo().vincular_aviso(cuerpo.postulacionId, id, calce / 100 if calce is not None else None)
            s.avisos.marcar_vinculo_enviado(id, f"{cuerpo.postulacionId}:{calce}")
        except NucleoNoDisponible as e:
            raise HTTPException(503, {"codigo": "NUCLEO_NO_DISPONIBLE", "mensaje": str(e)}) from e
        g2 = s.avisos.por_id(id)
        assert g2 is not None
        return vista_aviso(g2, detalle=True)

    @app.get("/api/ia/perfil")
    def ver_perfil(_: Annotated[str, Depends(con_token)]) -> dict[str, Any]:
        p = srv().perfiles.perfil()
        return {"herramientas": p.herramientas if p else {}, "anosTotales": p.anos_totales if p else 0}

    @app.put("/api/ia/perfil")
    def guardar_perfil(cuerpo: PerfilEntrada, _: Annotated[str, Depends(con_token)]) -> dict[str, Any]:
        s = srv()
        herramientas = {k.strip()[:80]: v for k, v in cuerpo.herramientas.items() if k.strip()}
        s.perfiles.guardar(Perfil(herramientas, cuerpo.anosTotales))
        n = s.recalcular_calces()
        return {"herramientas": herramientas, "anosTotales": cuerpo.anosTotales, "recalculados": n}

    @app.post("/api/ia/preguntas")
    def preguntar(cuerpo: PreguntaEntrada, _: Annotated[str, Depends(con_token)]) -> dict[str, Any]:
        s = srv()
        if not s.hay_modelo():
            raise HTTPException(503, {"codigo": "IA_NO_DISPONIBLE", "mensaje": "Falta la llave de OpenAI"})
        r = s.preguntar(cuerpo.pregunta.strip())
        if r.error:
            raise HTTPException(503, {"codigo": "IA_NO_DISPONIBLE", "mensaje": r.error})
        return {
            "respuesta": r.respuesta.texto,
            "citados": [vista_aviso(g) for g in r.avisos],
            "descartados": len(r.respuesta.descartados),
            "costoUsd": r.costo_usd,
        }

    return app


app = crear_app() if __name__ != "__main__" else None
