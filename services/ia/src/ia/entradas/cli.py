"""Línea de comandos `ia`: credenciales (F2-03), importar avisos (F2-09) y evaluar (F2-14)."""

import argparse


def main() -> None:
    parser = argparse.ArgumentParser(prog="ia", description="Herramientas del servicio con IA de Brecha")
    parser.add_subparsers(dest="comando")
    parser.parse_args()
    parser.print_help()


if __name__ == "__main__":
    main()
