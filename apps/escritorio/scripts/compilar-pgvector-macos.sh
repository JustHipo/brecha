#!/usr/bin/env bash
# Compila pgvector para macOS arm64 contra PostgreSQL 17, como dice su README oficial (`make` y `make install`).
#
# Por qué: desde la revisión 0.8.7_1, la fórmula `pgvector` de Homebrew solo trae PostgreSQL 18 y 19, y la app
# lleva PostgreSQL 17.12 embebido (D36). Con `brew install pgvector` ya no aparece `lib/postgresql@17/vector.dylib`.
#
# Necesita `pg_config` de un PostgreSQL 17 (en el CI: `brew install postgresql@17`). Las extensiones son
# compatibles entre versiones menores, así que basta con la mayor 17.
#
# Deja en $1 (por defecto apps/escritorio/empaquetado/pgvector, fuera de git) la misma forma que el pgvector de Homebrew:
#   lib/postgresql@17/vector.dylib y share/postgresql@17/extension/vector*
# Úsalo con PGVECTOR_DIR=<esa carpeta> node apps/escritorio/scripts/preparar-postgres.mjs
set -euo pipefail

VERSION="${PGVECTOR_VERSION:-v0.8.7}"
SALIDA="${1:-$(cd "$(dirname "$0")/.." && pwd)/empaquetado/pgvector}"
PG_CONFIG="${PG_CONFIG:-$(brew --prefix postgresql@17 2>/dev/null)/bin/pg_config}"

if [[ ! -x "$PG_CONFIG" ]]; then
  echo "No encuentro pg_config de PostgreSQL 17 en $PG_CONFIG. Instálalo con: brew install postgresql@17" >&2
  exit 1
fi
version_pg="$("$PG_CONFIG" --version)"
echo "PostgreSQL para compilar: $version_pg ($PG_CONFIG)"
if [[ "$version_pg" != "PostgreSQL 17."* ]]; then
  echo "Se esperaba PostgreSQL 17 (el de la app) y es '$version_pg'" >&2
  exit 1
fi

trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT
git clone --quiet --depth 1 --branch "$VERSION" https://github.com/pgvector/pgvector.git "$trabajo/fuente"

# OPTFLAGS vacío: sin -march=native, para que el binario corra en cualquier Mac con Apple Silicon.
make -C "$trabajo/fuente" PG_CONFIG="$PG_CONFIG" OPTFLAGS="" >/dev/null
make -C "$trabajo/fuente" PG_CONFIG="$PG_CONFIG" OPTFLAGS="" install DESTDIR="$trabajo/instalado" >/dev/null

lib="$trabajo/instalado$("$PG_CONFIG" --pkglibdir)"
ext="$trabajo/instalado$("$PG_CONFIG" --sharedir)/extension"
rm -rf "$SALIDA"
mkdir -p "$SALIDA/lib/postgresql@17" "$SALIDA/share/postgresql@17/extension"
cp "$lib/vector.dylib" "$SALIDA/lib/postgresql@17/"
cp "$ext"/vector* "$SALIDA/share/postgresql@17/extension/"

echo "pgvector $VERSION compilado en $SALIDA:"
ls "$SALIDA/lib/postgresql@17" "$SALIDA/share/postgresql@17/extension" | sed 's/^/  /'
