"""`pnpm dev`: levanta la API de IA (con recarga de uvicorn) y el vigía.

El vigía se reinicia si cambia el código.
"""

import subprocess
import sys
import time
from pathlib import Path

from ia.infraestructura.config import cargar_config

SRC = Path(__file__).resolve().parents[2]


def ultima_modificacion() -> float:
    return max((p.stat().st_mtime for p in SRC.rglob("*.py")), default=0.0)


def lanzar_vigia() -> subprocess.Popen[bytes]:
    return subprocess.Popen([sys.executable, "-m", "ia.entradas.vigia"])


def main() -> None:
    cfg = cargar_config()
    api = subprocess.Popen(
        [
            sys.executable, "-m", "uvicorn", "ia.entradas.api:app", "--host", "127.0.0.1",
            "--port", str(cfg.ia_puerto), "--reload", "--reload-dir", str(SRC),
        ]
    )  # fmt: skip
    vigia = lanzar_vigia()
    visto = ultima_modificacion()
    try:
        while api.poll() is None:
            time.sleep(2)
            ahora = ultima_modificacion()
            if ahora != visto:
                visto = ahora
                print("ia.dev: cambió el código, reinicio el vigía", flush=True)
                vigia.terminate()
                vigia.wait(timeout=10)
                vigia = lanzar_vigia()
    except KeyboardInterrupt:
        pass
    finally:
        for p in (api, vigia):
            p.terminate()


if __name__ == "__main__":
    main()
