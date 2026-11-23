"""Línea de comandos `ia`: credenciales (F2-03); después, importar avisos (F2-09) y evaluar (F2-14)."""

import argparse
import getpass
import sys

from ia.aplicacion.puertos import Credenciales, TipoDeCredencial, estado_de
from ia.infraestructura.llavero import Llavero


def credenciales(args: argparse.Namespace, llavero: Credenciales) -> int:
    match args.accion:
        case "correo":
            usuario = input("Correo de Gmail: ").strip()
            clave = getpass.getpass("Contraseña de aplicación (no se muestra): ").replace(" ", "")
            if "@" not in usuario or len(clave) < 16:
                print("Revisa el correo y la contraseña de aplicación (16 letras).", file=sys.stderr)
                return 1
            llavero.guardar(TipoDeCredencial.CORREO_USUARIO, usuario)
            llavero.guardar(TipoDeCredencial.CORREO_CLAVE, clave)
            print("Correo guardado en el llavero.")
        case "openai":
            llave = getpass.getpass("Llave de OpenAI (no se muestra): ").strip()
            if not llave.startswith("sk-"):
                print("Esa no parece una llave de OpenAI (empieza con sk-).", file=sys.stderr)
                return 1
            llavero.guardar(TipoDeCredencial.OPENAI, llave)
            print("Llave de OpenAI guardada en el llavero.")
        case "estado":
            e = estado_de(llavero)
            print(f"Correo: {'configurado' if e.correo else 'falta'}")
            print(f"OpenAI: {'configurado' if e.openai else 'falta'}")
        case "borrar":
            for t in TipoDeCredencial:
                llavero.borrar(t)
            print("Credenciales de Brecha borradas del llavero.")
    return 0


def main(argv: list[str] | None = None, llavero: Credenciales | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ia", description="Herramientas del servicio con IA de Brecha")
    sub = parser.add_subparsers(dest="comando", required=True)
    cred = sub.add_parser("credenciales", help="Guardar, revisar o borrar credenciales en el llavero")
    cred.add_argument("accion", choices=["correo", "openai", "estado", "borrar"])
    args = parser.parse_args(argv)
    if args.comando == "credenciales":
        return credenciales(args, llavero or Llavero())
    return 2


if __name__ == "__main__":
    sys.exit(main())
