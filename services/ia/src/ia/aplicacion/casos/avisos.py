"""F2-09 a F2-12: avisos importados o buscados, su análisis y calce, embeddings y Preguntar."""

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime

from ia.aplicacion.puertos import (
    AnalizadorDeAvisos,
    AvisoGuardado,
    AvisoParaResponder,
    Embeddings,
    EnlaceConNucleo,
    ErrorDeModelo,
    FiltrosDeAvisos,
    FuenteDeAvisos,
    NucleoNoDisponible,
    RegistroDeTrazas,
    RepositorioDeAvisos,
    RepositorioDePerfil,
    Respondedor,
    Traza,
    Uso,
)
from ia.dominio.aviso import Aviso, AvisoInvalido
from ia.dominio.calce import calcular_calce
from ia.dominio.clasificacion import costo_usd
from ia.dominio.respuesta import NO_ENCONTRE, Respuesta, verificar_citas

Precios = tuple[float, float]


_SEGUIMIENTO = re.compile(
    r"^(utm_.*|trk.*|ref|refid|trackingid|src|source|origin|fbclid|gclid|lipi|position|pagenum)$"
)


def url_normalizada(url: str) -> str:
    """Para ligar un aviso con una postulación: sin esquema ni www, sin parámetros de seguimiento.

    Se conservan los otros parámetros, porque algunos portales llevan ahí el id (`?jk=` de Indeed).
    """
    u = re.sub(r"^https?://(www\.)?", "", url.strip().lower()).split("#", 1)[0]
    base, _, consulta = u.partition("?")
    pares = sorted(p for p in consulta.split("&") if p and not _SEGUIMIENTO.match(p.split("=", 1)[0]))
    return base.rstrip("/") + ("?" + "&".join(pares) if pares else "")


class _ConTrazas:
    def __init__(self, trazas: RegistroDeTrazas, ahora: Callable[[], datetime], precios: Precios) -> None:
        self.trazas = trazas
        self.ahora = ahora
        self.precios = precios

    def _ok(self, caso: str, uso: Uso) -> float:
        costo = costo_usd(uso.tokens_entrada, uso.tokens_salida, *self.precios)
        self.trazas.registrar(
            Traza(
                caso,
                uso.modelo,
                uso.tokens_entrada,
                uso.tokens_salida,
                costo,
                uso.duracion_ms,
                "ok",
                self.ahora(),
            )
        )
        return costo

    def _fallo(self, caso: str, e: ErrorDeModelo) -> None:
        self.trazas.registrar(Traza(caso, "", 0, 0, 0.0, 0, e.tipo, self.ahora()))


# ── F2-09: importar y buscar ───────────────────────────────────────────────────


@dataclass
class ResumenDeImportacion:
    nuevos: int = 0
    actualizados: int = 0
    invalidos: list[str] = field(default_factory=list)


class ImportarAvisos:
    """Idempotente por URL: importar dos veces deja los mismos avisos."""

    def __init__(self, repo: RepositorioDeAvisos) -> None:
        self.repo = repo

    def ejecutar(self, crudos: list[Callable[[], Aviso]]) -> ResumenDeImportacion:
        r = ResumenDeImportacion()
        for i, crear in enumerate(crudos):
            try:
                aviso = crear()
            except (AvisoInvalido, KeyError, ValueError) as e:
                r.invalidos.append(f"#{i + 1}: {e}")
                continue
            _, nuevo = self.repo.guardar(aviso)
            if nuevo:
                r.nuevos += 1
            else:
                r.actualizados += 1
        return r


@dataclass
class ResumenDeBusqueda:
    encontrados: int = 0
    nuevos: int = 0
    error: str | None = None


class BuscarAvisos:
    def __init__(self, fuente: FuenteDeAvisos, repo: RepositorioDeAvisos) -> None:
        self.fuente = fuente
        self.repo = repo

    def ejecutar(self, consultas: list[str], maximo_por_consulta: int = 40) -> ResumenDeBusqueda:
        r = ResumenDeBusqueda()
        for consulta in consultas:
            try:
                avisos = self.fuente.buscar(consulta, maximo_por_consulta)
            except Exception as e:  # la fuente es externa: su error se ve y no corta las otras búsquedas
                r.error = f"{consulta}: {type(e).__name__}: {str(e)[:200]}"
                continue
            for a in avisos:
                r.encontrados += 1
                if self.repo.guardar(a)[1]:
                    r.nuevos += 1
        return r


# ── F2-10: análisis, calce y vínculo con la postulación ────────────────────────


@dataclass
class ResumenDeAnalisis:
    analizados: int = 0
    sin_perfil: bool = False
    vinculados: int = 0
    fallidos: int = 0
    costo_usd: float = 0.0
    error: str | None = None


class AnalizarAvisos(_ConTrazas):
    def __init__(
        self,
        analizador: AnalizadorDeAvisos,
        repo: RepositorioDeAvisos,
        perfiles: RepositorioDePerfil,
        trazas: RegistroDeTrazas,
        ahora: Callable[[], datetime],
        precios: Precios,
        limite: int = 50,
    ) -> None:
        super().__init__(trazas, ahora, precios)
        self.analizador = analizador
        self.repo = repo
        self.perfiles = perfiles
        self.limite = limite

    def ejecutar(self) -> ResumenDeAnalisis:
        r = ResumenDeAnalisis()
        perfil = self.perfiles.perfil()
        r.sin_perfil = perfil is None
        for g in self.repo.sin_analizar(self.limite):
            try:
                requisitos, uso = self.analizador.analizar_aviso(g.aviso)
            except ErrorDeModelo as e:
                self._fallo("analizar_aviso", e)
                if e.detiene:
                    r.error = f"{e.tipo}: {e}"
                    break
                r.fallidos += 1
                continue
            r.costo_usd = round(r.costo_usd + self._ok("analizar_aviso", uso), 6)
            calce = calcular_calce(perfil, requisitos) if perfil else None
            self.repo.guardar_analisis(g.id, requisitos, calce, uso.modelo)
            r.analizados += 1
        return r


class RecalcularCalces:
    """Al cambiar el perfil, el calce se recalcula sin volver a llamar al modelo."""

    def __init__(self, repo: RepositorioDeAvisos, perfiles: RepositorioDePerfil) -> None:
        self.repo = repo
        self.perfiles = perfiles

    def ejecutar(self) -> int:
        perfil = self.perfiles.perfil()
        n = 0
        for g in self.repo.analizados():
            calce = calcular_calce(perfil, list(g.requisitos or ())) if perfil else None
            self.repo.recalcular(g.id, calce)
            n += 1
        return n


@dataclass
class ResumenDeVinculos:
    vinculados: int = 0
    calces_enviados: int = 0
    error: str | None = None


class VincularConPostulaciones:
    """Liga cada aviso con la postulación de la misma URL y le manda el calce al núcleo (0 a 1)."""

    def __init__(self, repo: RepositorioDeAvisos, nucleo: EnlaceConNucleo) -> None:
        self.repo = repo
        self.nucleo = nucleo

    def ejecutar(self) -> ResumenDeVinculos:
        r = ResumenDeVinculos()
        try:
            por_url = {url_normalizada(p.url): p.id for p in self.nucleo.postulaciones() if p.url}
            for g in self.repo.listar(FiltrosDeAvisos(limite=10_000)):
                pid = por_url.get(url_normalizada(g.aviso.url))
                if pid is None:
                    continue
                if g.postulacion_id != pid:
                    self.repo.vincular(g.id, pid)
                    r.vinculados += 1
                calce = g.calce.puntaje if g.calce else None
                clave = f"{pid}:{calce}"
                if g.vinculo_enviado == clave:
                    continue  # el núcleo ya lo tiene: no se toca la postulación en cada vuelta
                self.nucleo.vincular_aviso(pid, g.id, calce / 100 if calce is not None else None)
                self.repo.marcar_vinculo_enviado(g.id, clave)
                r.calces_enviados += 1
        except NucleoNoDisponible as e:
            r.error = str(e)
        return r


# ── F2-11: embeddings ──────────────────────────────────────────────────────────


@dataclass
class ResumenDeIndexado:
    indexados: int = 0
    costo_usd: float = 0.0
    error: str | None = None


class IndexarAvisos(_ConTrazas):
    def __init__(
        self,
        embeddings: Embeddings,
        repo: RepositorioDeAvisos,
        trazas: RegistroDeTrazas,
        ahora: Callable[[], datetime],
        precio: float,
        lote: int = 64,
    ) -> None:
        super().__init__(trazas, ahora, (precio, 0.0))
        self.embeddings = embeddings
        self.repo = repo
        self.lote = lote

    def ejecutar(self) -> ResumenDeIndexado:
        r = ResumenDeIndexado()
        while pendientes := self.repo.sin_vector(self.lote):
            try:
                vectores, uso = self.embeddings.embeber([g.aviso.para_embeber() for g in pendientes])
            except ErrorDeModelo as e:
                self._fallo("embeber_avisos", e)
                r.error = f"{e.tipo}: {e}"
                break
            r.costo_usd = round(r.costo_usd + self._ok("embeber_avisos", uso), 6)
            for g, v in zip(pendientes, vectores, strict=True):
                self.repo.guardar_vector(g.id, v, self.embeddings.modelo_embeddings)
                r.indexados += 1
        return r


# ── F2-12: Preguntar (RAG) ─────────────────────────────────────────────────────

K_RECUPERADOS = 8
_MODALIDADES = {"remot": "remoto", "hibrid": "hibrido", "híbrid": "hibrido", "presencial": "presencial"}


def filtros_de_la_pregunta(pregunta: str) -> FiltrosDeAvisos:
    """Filtros simples en SQL cuando la pregunta los trae (modalidad o un sueldo mínimo en USD)."""
    p = pregunta.lower()
    modalidad = next((m for clave, m in _MODALIDADES.items() if clave in p), None)
    usd = re.search(r"(?:usd|us\$|dólares|dolares)\s*([\d.]+)|([\d.]+)\s*(?:usd|dólares|dolares)", p)
    minimo = None
    if usd and ("más de" in p or "mas de" in p or "sobre" in p or "mínimo" in p or "minimo" in p):
        minimo = int((usd.group(1) or usd.group(2)).replace(".", ""))
    por_calce = any(
        x in p for x in ("calce", "calza", "encaj", "me conviene", "mejor para mí", "mejor para mi")
    )
    return FiltrosDeAvisos(modalidad=modalidad, usd_minimo=minimo, limite=K_RECUPERADOS, por_calce=por_calce)


@dataclass(frozen=True)
class ResultadoDePregunta:
    respuesta: Respuesta
    avisos: list[AvisoGuardado]
    costo_usd: float
    error: str | None = None


class Preguntar(_ConTrazas):
    def __init__(
        self,
        embeddings: Embeddings,
        respondedor: Respondedor,
        repo: RepositorioDeAvisos,
        trazas: RegistroDeTrazas,
        ahora: Callable[[], datetime],
        precios: Precios,
        precio_embeddings: float,
    ) -> None:
        super().__init__(trazas, ahora, precios)
        self.embeddings = embeddings
        self.respondedor = respondedor
        self.repo = repo
        self.precio_embeddings = precio_embeddings

    def ejecutar(self, pregunta: str) -> ResultadoDePregunta:
        try:
            [vector], uso_e = self.embeddings.embeber([pregunta])
        except ErrorDeModelo as e:
            self._fallo("embeber_pregunta", e)
            return ResultadoDePregunta(Respuesta(NO_ENCONTRE, ()), [], 0.0, f"{e.tipo}: {e}")
        costo = costo_usd(uso_e.tokens_entrada, 0, self.precio_embeddings, 0)
        self.trazas.registrar(
            Traza(
                "embeber_pregunta",
                uso_e.modelo,
                uso_e.tokens_entrada,
                0,
                costo,
                uso_e.duracion_ms,
                "ok",
                self.ahora(),
            )
        )
        filtros = filtros_de_la_pregunta(pregunta)
        recuperados = (
            [g for g in self.repo.listar(filtros) if g.calce is not None]
            if filtros.por_calce
            else self.repo.cercanos(vector, K_RECUPERADOS, filtros)
        )
        if not recuperados and (filtros.modalidad or filtros.usd_minimo):
            recuperados = self.repo.cercanos(vector, K_RECUPERADOS, FiltrosDeAvisos(limite=K_RECUPERADOS))
        if not recuperados:
            return ResultadoDePregunta(Respuesta(NO_ENCONTRE, ()), [], costo)
        contexto = [
            AvisoParaResponder(
                g.id,
                g.aviso.titulo,
                g.aviso.empresa,
                g.aviso.modalidad,
                g.aviso.sueldo,
                g.aviso.stack,
                g.aviso.texto[:1500],
                g.calce.puntaje if g.calce else None,
                g.calce.brechas[:6] if g.calce else (),
            )
            for g in recuperados
        ]
        try:
            texto, citados, uso = self.respondedor.responder(pregunta, contexto)
        except ErrorDeModelo as e:
            self._fallo("preguntar", e)
            return ResultadoDePregunta(Respuesta(NO_ENCONTRE, ()), [], costo, f"{e.tipo}: {e}")
        costo = round(costo + self._ok("preguntar", uso), 6)
        respuesta = verificar_citas(texto, citados, [g.id for g in recuperados])
        citados_set = set(respuesta.citados)
        return ResultadoDePregunta(respuesta, [g for g in recuperados if g.id in citados_set], costo)
