"""Vigía (modo liviano, ADR 0014): revisa el correo cada D29 minutos. F2-05 a F2-08 le dan trabajo."""

import logging
import signal
import threading

from ia.aplicacion.puertos import Credenciales, estado_de
from ia.infraestructura.config import cargar_config
from ia.infraestructura.llavero import Llavero

log = logging.getLogger("ia.vigia")


def una_vuelta(credenciales: Credenciales) -> list[str]:
    """Una revisión. Sin credenciales no falla: dice qué falta y sigue esperando (nada silencioso)."""
    faltan = estado_de(credenciales).faltantes()
    if faltan:
        log.warning("faltan credenciales: %s", "; ".join(faltan))
        return faltan
    log.info("vuelta del vigía: todavía sin lector de correo (F2-05)")
    return []


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    cfg = cargar_config()
    llavero = Llavero()
    parar = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: parar.set())
    signal.signal(signal.SIGINT, lambda *_: parar.set())
    log.info("vigía en marcha: cada %s minutos", cfg.vigia_minutos)
    while not parar.is_set():
        una_vuelta(llavero)
        parar.wait(cfg.vigia_minutos * 60)
    log.info("vigía detenido")


if __name__ == "__main__":
    main()
