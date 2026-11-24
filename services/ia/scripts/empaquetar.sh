#!/usr/bin/env bash
# Arma dist/brecha-ia/ (PyInstaller, onedir, macOS arm64) para la app de escritorio y lo comprueba.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "empaquetar: este paquete es para macOS arm64 (aquí: $(uname -s) $(uname -m))" >&2
  exit 1
fi

# PyInstaller es dependencia de desarrollo (versión fija en uv.lock).
uv run --frozen pyinstaller --noconfirm --clean --distpath dist --workpath build brecha-ia.spec

# Sin configuración ni red: solo revisa que el ejecutable importe todo lo que usa al correr.
./dist/brecha-ia/brecha-ia comprobar
du -sh dist/brecha-ia
