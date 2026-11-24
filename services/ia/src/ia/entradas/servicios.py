"""Raíz de composición: arma los casos de uso con sus adaptadores (vigía, API y línea de comandos)."""

from datetime import UTC, datetime
from functools import cached_property
from typing import Any

from sqlalchemy import Engine

from ia.aplicacion.casos.avisos import (
    AnalizarAvisos,
    BuscarAvisos,
    IndexarAvisos,
    Preguntar,
    RecalcularCalces,
    ResultadoDePregunta,
    VincularConPostulaciones,
)
from ia.aplicacion.puertos import (
    Credenciales,
    EnlaceConNucleo,
    FuenteDeAvisos,
    NucleoNoDisponible,
    TipoDeCredencial,
)
from ia.infraestructura.config import Config
from ia.infraestructura.getonboard import GetOnBoard
from ia.infraestructura.nucleo_http import NucleoHttp, leer_token
from ia.infraestructura.openai_modelo import ModeloOpenAI
from ia.infraestructura.postgres.avisos import RepositorioPostgresDeAvisos, RepositorioPostgresDePerfil
from ia.infraestructura.postgres.correos import TrazasPostgres
from ia.infraestructura.postgres.motor import crear_motor


def ahora() -> datetime:
    return datetime.now(UTC)


class Servicios:
    def __init__(
        self,
        cfg: Config,
        credenciales: Credenciales,
        motor: Engine | None = None,
        modelo: Any = None,
        fuente: FuenteDeAvisos | None = None,
        nucleo: EnlaceConNucleo | None = None,
    ) -> None:
        """`modelo`, `fuente` y `nucleo` reemplazan a OpenAI, Get on Board y el núcleo en las pruebas."""
        self.cfg = cfg
        self.credenciales = credenciales
        self._motor = motor
        self._modelo = modelo
        self._fuente = fuente
        self._nucleo = nucleo

    @cached_property
    def motor(self) -> Engine:
        return self._motor or crear_motor(self.cfg.ia_database_url)

    @cached_property
    def avisos(self) -> RepositorioPostgresDeAvisos:
        return RepositorioPostgresDeAvisos(self.motor)

    @cached_property
    def perfiles(self) -> RepositorioPostgresDePerfil:
        return RepositorioPostgresDePerfil(self.motor)

    @cached_property
    def trazas(self) -> TrazasPostgres:
        return TrazasPostgres(self.motor)

    @property
    def precios(self) -> tuple[float, float]:
        return (self.cfg.openai_precio_entrada, self.cfg.openai_precio_salida)

    def hay_modelo(self) -> bool:
        return self._modelo is not None or bool(self.credenciales.obtener(TipoDeCredencial.OPENAI))

    def modelo(self) -> Any:
        if self._modelo is not None:
            return self._modelo
        return ModeloOpenAI(
            self.credenciales.obtener(TipoDeCredencial.OPENAI) or "",
            self.cfg.openai_modelo,
            modelo_embeddings=self.cfg.openai_modelo_embeddings,
        )

    def nucleo(self) -> EnlaceConNucleo:
        return self._nucleo if self._nucleo is not None else self.nucleo_http()

    def nucleo_http(self) -> NucleoHttp:
        return NucleoHttp(self.cfg.nucleo_url, leer_token(self.cfg.carpeta_instancia))

    def buscar_getonboard(self, consultas: list[str], maximo: int = 40) -> dict[str, Any]:
        r = BuscarAvisos(self._fuente or GetOnBoard(), self.avisos).ejecutar(consultas, maximo)
        return {"encontrados": r.encontrados, "nuevos": r.nuevos, "error": r.error}

    def procesar_avisos(self) -> dict[str, Any]:
        """Analiza, calcula el calce, indexa y liga con las postulaciones lo que falte."""
        salida: dict[str, Any] = {}
        if self.hay_modelo():
            m = self.modelo()
            a = AnalizarAvisos(m, self.avisos, self.perfiles, self.trazas, ahora, self.precios).ejecutar()
            salida["analisis"] = {
                "analizados": a.analizados,
                "sinPerfil": a.sin_perfil,
                "fallidos": a.fallidos,
                "costoUsd": a.costo_usd,
                "error": a.error,
            }
            i = IndexarAvisos(
                m, self.avisos, self.trazas, ahora, self.cfg.openai_precio_embeddings
            ).ejecutar()
            salida["indexado"] = {"indexados": i.indexados, "costoUsd": i.costo_usd, "error": i.error}
        try:
            v = VincularConPostulaciones(self.avisos, self.nucleo()).ejecutar()
            salida["vinculos"] = {
                "vinculados": v.vinculados,
                "calcesEnviados": v.calces_enviados,
                "error": v.error,
            }
        except NucleoNoDisponible as e:
            salida["vinculos"] = {"vinculados": 0, "calcesEnviados": 0, "error": str(e)}
        return salida

    def recalcular_calces(self) -> int:
        return RecalcularCalces(self.avisos, self.perfiles).ejecutar()

    def preguntar(self, pregunta: str) -> ResultadoDePregunta:
        m = self.modelo()
        return Preguntar(
            m, m, self.avisos, self.trazas, ahora, self.precios, self.cfg.openai_precio_embeddings
        ).ejecutar(pregunta)
