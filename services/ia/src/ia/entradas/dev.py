"""`pnpm dev`: levanta la API de IA (con recarga) y el vigía como procesos hijos."""

import subprocess
import sys

from ia.infraestructura.config import cargar_config


def main() -> None:
    cfg = cargar_config()
    api = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "ia.entradas.api:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(cfg.ia_puerto),
            "--reload",
            "--reload-dir",
            "src",
        ]
    )
    vigia = subprocess.Popen([sys.executable, "-m", "ia.entradas.vigia"])
    try:
        api.wait()
    except KeyboardInterrupt:
        pass
    finally:
        for p in (api, vigia):
            p.terminate()


if __name__ == "__main__":
    main()
