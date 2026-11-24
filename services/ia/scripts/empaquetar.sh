#!/usr/bin/env bash
# Arma dist/brecha-ia/ (PyInstaller, onedir) para la app de escritorio y lo comprueba.
# macOS arm64 o Windows x64 (en Windows corre con el bash de Git, como en el CI).
set -euo pipefail
cd "$(dirname "$0")/.."

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) ejecutable=brecha-ia ;;
  MINGW64*-x86_64 | MSYS*-x86_64) ejecutable=brecha-ia.exe ;;
  *)
    echo "empaquetar: este paquete es para macOS arm64 o Windows x64 (aquí: $(uname -s) $(uname -m))" >&2
    exit 1
    ;;
esac

# PyInstaller es dependencia de desarrollo (versión fija en uv.lock).
uv run --frozen pyinstaller --noconfirm --clean --distpath dist --workpath build brecha-ia.spec

# Sin configuración ni red: solo revisa que el ejecutable importe todo lo que usa al correr.
./dist/brecha-ia/$ejecutable comprobar
du -sh dist/brecha-ia
