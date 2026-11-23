"""Vigía (modo liviano, ADR 0014): revisa el correo cada D29 minutos. F2-05 a F2-08 le dan trabajo."""

import logging
import signal
import threading

from ia.infraestructura.config import cargar_config

log = logging.getLogger("ia.vigia")


def una_vuelta() -> None:
    log.info("vuelta del vigía: todavía sin lector de correo (F2-05)")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    cfg = cargar_config()
    parar = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: parar.set())
    signal.signal(signal.SIGINT, lambda *_: parar.set())
    log.info("vigía en marcha: cada %s minutos", cfg.vigia_minutos)
    while not parar.is_set():
        una_vuelta()
        parar.wait(cfg.vigia_minutos * 60)
    log.info("vigía detenido")


if __name__ == "__main__":
    main()
