"""Vigía (modo liviano, ADR 0014): revisa el correo cada D29 minutos y, con OpenAI, clasifica ahí mismo."""

import logging
import signal
import threading
from collections.abc import Callable
from datetime import UTC, datetime

from ia.aplicacion.casos.clasificar_pendientes import ClasificarPendientes, ResumenDeClasificacion
from ia.aplicacion.casos.sincronizar_correo import ResumenDeSincronizacion, SincronizarCorreo
from ia.aplicacion.puertos import Credenciales, TipoDeCredencial, estado_de
from ia.infraestructura.config import cargar_config
from ia.infraestructura.imap import LectorImap
from ia.infraestructura.llavero import Llavero
from ia.infraestructura.openai_modelo import ModeloOpenAI
from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos, TrazasPostgres
from ia.infraestructura.postgres.motor import crear_motor

log = logging.getLogger("ia.vigia")


def una_vuelta(
    credenciales: Credenciales,
    sincronizar: Callable[[], ResumenDeSincronizacion] | None = None,
    clasificar: Callable[[], ResumenDeClasificacion] | None = None,
) -> list[str]:
    """Una revisión. Sin credenciales no falla: dice qué falta y sigue esperando (nada silencioso)."""
    estado = estado_de(credenciales)
    faltan = estado.faltantes()
    if not estado.correo:
        log.warning("faltan credenciales: %s", "; ".join(faltan))
        return faltan
    if sincronizar is not None:
        r = sincronizar()
        if r.error:
            log.error("la lectura del correo falló: %s", r.error)
        else:
            log.info(
                "correo: %s leídos, %s filtrados, %s para clasificar %s, %s en cola",
                r.leidos,
                r.filtrados,
                r.pendientes,
                r.por_plataforma,
                r.en_cola,
            )
    # Con OpenAI el vigía clasifica ahí mismo (ADR 0014); sin llave, los correos esperan en cola.
    if clasificar is not None and estado.openai:
        k = clasificar()
        if k.error:
            log.error("la IA no está disponible: %s (los correos siguen en cola)", k.error)
        else:
            log.info(
                "clasificados %s (%s de postulaciones: %s), USD %.4f",
                k.clasificados,
                k.de_postulacion,
                k.por_estado,
                k.costo_usd,
            )
    elif not estado.openai:
        log.warning("falta la llave de OpenAI: los correos quedan en cola")
    return faltan


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    cfg = cargar_config()
    llavero = Llavero()
    motor = crear_motor(cfg.ia_database_url)
    repo = RepositorioPostgresDeCorreos(motor)
    trazas = TrazasPostgres(motor)

    def sincronizar() -> ResumenDeSincronizacion:
        lector = LectorImap(
            llavero.obtener(TipoDeCredencial.CORREO_USUARIO) or "",
            llavero.obtener(TipoDeCredencial.CORREO_CLAVE) or "",
        )
        return SincronizarCorreo(
            lector, repo, lambda: datetime.now(UTC), cfg.dias_primera_sincronizacion
        ).ejecutar()

    def clasificar() -> ResumenDeClasificacion:
        modelo = ModeloOpenAI(llavero.obtener(TipoDeCredencial.OPENAI) or "", cfg.openai_modelo)
        precios = (cfg.openai_precio_entrada, cfg.openai_precio_salida)
        return ClasificarPendientes(modelo, repo, trazas, lambda: datetime.now(UTC), precios).ejecutar()

    parar = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: parar.set())
    signal.signal(signal.SIGINT, lambda *_: parar.set())
    log.info("vigía en marcha: cada %s minutos", cfg.vigia_minutos)
    while not parar.is_set():
        una_vuelta(llavero, sincronizar, clasificar)
        parar.wait(cfg.vigia_minutos * 60)
    log.info("vigía detenido")


if __name__ == "__main__":
    main()
