"""`brecha-ia`: el único ejecutable del servicio con IA; la app de escritorio lo lanza como procesos hijos.

Subcomandos:
- `api`: la API de IA con uvicorn en 127.0.0.1:IA_PUERTO (sin recarga).
- `vigia`: el vigía del correo y los avisos (`--comprobar` solo revisa que todo se importe).
- `migrar`: `alembic upgrade head` con las migraciones que van dentro del ejecutable.
- `comprobar`: importa todo lo que el servicio usa al correr y sale (0 si está completo).
- `credenciales`, `avisos`, `perfil`, `preguntar`, `probar-correo`, `red`, `evaluar`, `pasos` y
  `correo`: la CLI `ia`.

Funciona igual desde el código (`uv run brecha-ia ...`) y empaquetado con PyInstaller.
"""

import argparse
import importlib
import importlib.util
import logging
import logging.config
import sys
from pathlib import Path

from pydantic import ValidationError

from ia.infraestructura.config import ConfigInvalida, cargar_config, esta_empaquetado

COMANDOS_DE_LA_CLI = (
    "credenciales",
    "avisos",
    "perfil",
    "preguntar",
    "probar-correo",
    "red",
    "evaluar",
    "pasos",
    "correo",
)
SALIDA_CONFIG_INVALIDA = 78  # EX_CONFIG de sysexits.h: la app distingue "falta configuración" de un fallo

# Lo que el servicio importa en tiempo de ejecución, incluso lo que uvicorn y keyring cargan por nombre.
MODULOS_EN_EJECUCION = (
    "ia.entradas.cli",
    "ia.entradas.servicios",
    "ia.entradas.vigia",
    "fastapi",
    "uvicorn",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "uvicorn.logging",
    "sqlalchemy.dialects.postgresql.psycopg",
    "psycopg",
    "pgvector.sqlalchemy",
    "alembic.command",
    "alembic.runtime.migration",
    "openai",
    "httpx",
    "imapclient",
    "keyring",
)


def carpeta_de_migraciones() -> Path:
    """Donde están `alembic.ini` y `alembic/`: dentro del ejecutable o en `services/ia`."""
    if esta_empaquetado():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)) / "migraciones"
    return Path(__file__).resolve().parents[3]


def _escapar(valor: str) -> str:
    return valor.replace("%", "%%")  # configparser interpreta los %


def migrar() -> int:
    from alembic import command
    from alembic.config import Config as ConfigAlembic

    base = carpeta_de_migraciones()
    ini = base / "alembic.ini"
    if not ini.is_file():
        print(f"No encuentro las migraciones en {base}", file=sys.stderr)
        return 1
    logging.config.fileConfig(ini, disable_existing_loggers=False)
    cfg = ConfigAlembic(str(ini))
    cfg.set_main_option("script_location", _escapar(str(base / "alembic")))
    # Empaquetado, `ia` ya va dentro del ejecutable: no se agrega nada a sys.path.
    cfg.set_main_option("prepend_sys_path", "" if esta_empaquetado() else _escapar(str(base / "src")))
    command.upgrade(cfg, "head")
    return 0


def api() -> int:
    import uvicorn

    cfg = cargar_config()
    from ia.entradas import api as modulo  # al importarse arma la app con crear_app()

    aplicacion = modulo.app or modulo.crear_app(cfg)
    uvicorn.run(aplicacion, host="127.0.0.1", port=cfg.ia_puerto, log_level="info")
    return 0


def vigia() -> int:
    cargar_config()  # falla aquí, con un mensaje claro, si falta algo
    from ia.entradas.vigia import main as vigia_main

    vigia_main()
    return 0


def comprobar() -> int:
    """Importa todo lo que se carga al correr, sin conectarse a nada ni leer credenciales."""
    faltan: list[str] = []
    for nombre in MODULOS_EN_EJECUCION:
        try:
            importlib.import_module(nombre)
        except Exception as e:
            faltan.append(f"{nombre}: {e}")
    if importlib.util.find_spec("ia.entradas.api") is None:  # importarlo arma la app y pide la base
        faltan.append("ia.entradas.api: no está")
    if not faltan:
        import httpx
        import keyring
        import psycopg
        from openai import OpenAI

        print(f"psycopg {psycopg.__version__} ({psycopg.pq.__impl__})")
        if psycopg.pq.__impl__ != "binary":
            faltan.append("psycopg_binary: psycopg no usa la libpq incluida")
        llavero = type(keyring.get_keyring()).__module__
        print(f"llavero: {llavero}")
        if sys.platform == "darwin" and llavero != "keyring.backends.macOS":
            faltan.append("keyring: no cargó el llavero de macOS")
        # Arman el contexto TLS con los certificados de certifi, sin abrir conexiones.
        httpx.Client().close()
        OpenAI(api_key="sk-comprobar").close()
        print("clientes HTTP: listos")
        versiones = carpeta_de_migraciones() / "alembic" / "versions"
        n = len(list(versiones.glob("*.py")))
        print(f"migraciones: {n} en {versiones}")
        if n == 0:
            faltan.append("migraciones: no están dentro del ejecutable")
    for f in faltan:
        print(f"falta {f}", file=sys.stderr)
    if not faltan:
        print(f"brecha-ia completo ({'empaquetado' if esta_empaquetado() else 'desde el código'})")
    return 1 if faltan else 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="brecha-ia", description="Servicio con IA de Brecha: API, vigía, migraciones y herramientas"
    )
    sub = parser.add_subparsers(dest="comando", required=True, metavar="comando")
    sub.add_parser("api", help="Levantar la API de IA en 127.0.0.1:IA_PUERTO")
    vi = sub.add_parser("vigia", help="Levantar el vigía del correo y los avisos")
    vi.add_argument("--comprobar", action="store_true", help="Solo revisar que todo se importe y salir")
    sub.add_parser("migrar", help="Aplicar las migraciones del esquema ia (alembic upgrade head)")
    sub.add_parser("comprobar", help="Revisar que el ejecutable tenga todo lo que usa al correr")
    for nombre, ayuda in (
        ("credenciales", "Guardar, revisar o borrar credenciales en el llavero"),
        ("avisos", "Importar, buscar en Get on Board y procesar avisos"),
        ("perfil", "Cargar o ver tu perfil (herramientas y años)"),
        ("preguntar", "Preguntar sobre tus avisos"),
        ("probar-correo", "Pasar correos de prueba (.eml) por el camino del vigía"),
        ("red", "Traer los avisos de LinkedIn del correo a tu red"),
        ("evaluar", "Medir la clasificación y Preguntar contra los umbrales de D30"),
        ("pasos", "Crear los pasos pendientes de los correos ya leídos"),
        ("correo", "Releer los correos que el filtro descartó en los últimos días"),
    ):
        sub.add_parser(nombre, help=f"{ayuda} (brecha-ia {nombre} --help)")
    return parser


def main(argv: list[str] | None = None) -> int:
    argumentos = sys.argv[1:] if argv is None else argv
    try:
        if argumentos and argumentos[0] in COMANDOS_DE_LA_CLI:
            from ia.entradas import cli

            return cli.main(argumentos)
        args = _parser().parse_args(argumentos)
        match args.comando:
            case "api":
                return api()
            case "vigia":
                return comprobar() if args.comprobar else vigia()
            case "migrar":
                return migrar()
            case "comprobar":
                return comprobar()
    except (ConfigInvalida, ValidationError) as e:
        print(f"brecha-ia: la configuración no sirve: {e}", file=sys.stderr)
        return SALIDA_CONFIG_INVALIDA
    return 2


if __name__ == "__main__":
    sys.exit(main())
