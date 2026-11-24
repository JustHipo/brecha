"""Vigía (modo liviano, ADR 0014): revisa el correo cada D29 minutos. F2-05 a F2-08 le dan trabajo."""

import logging
import signal
import threading
from collections.abc import Callable
from datetime import UTC, datetime

from ia.aplicacion.casos.sincronizar_correo import ResumenDeSincronizacion, SincronizarCorreo
from ia.aplicacion.puertos import Credenciales, TipoDeCredencial, estado_de
from ia.infraestructura.config import cargar_config
from ia.infraestructura.imap import LectorImap
from ia.infraestructura.llavero import Llavero
from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos
from ia.infraestructura.postgres.motor import crear_motor

log = logging.getLogger("ia.vigia")


def una_vuelta(
    credenciales: Credenciales, sincronizar: Callable[[], ResumenDeSincronizacion] | None = None
) -> list[str]:
    """Una revisión. Sin credenciales no falla: dice qué falta y sigue esperando (nada silencioso)."""
    faltan = estado_de(credenciales).faltantes()
    if not estado_de(credenciales).correo:
        log.warning("faltan credenciales: %s", "; ".join(faltan))
        return faltan
    if sincronizar is None:
        return faltan
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
    return faltan


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    cfg = cargar_config()
    llavero = Llavero()
    repo = RepositorioPostgresDeCorreos(crear_motor(cfg.ia_database_url))

    def sincronizar() -> ResumenDeSincronizacion:
        lector = LectorImap(
            llavero.obtener(TipoDeCredencial.CORREO_USUARIO) or "",
            llavero.obtener(TipoDeCredencial.CORREO_CLAVE) or "",
        )
        return SincronizarCorreo(
            lector, repo, lambda: datetime.now(UTC), cfg.dias_primera_sincronizacion
        ).ejecutar()

    parar = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: parar.set())
    signal.signal(signal.SIGINT, lambda *_: parar.set())
    log.info("vigía en marcha: cada %s minutos", cfg.vigia_minutos)
    while not parar.is_set():
        una_vuelta(llavero, sincronizar)
        parar.wait(cfg.vigia_minutos * 60)
    log.info("vigía detenido")


if __name__ == "__main__":
    main()
