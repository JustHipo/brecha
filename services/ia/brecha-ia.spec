# Receta de PyInstaller para `brecha-ia` (onedir; macOS arm64 o Windows x64). Se arma con scripts/empaquetar.sh.
# Sale en dist/brecha-ia/: el ejecutable `brecha-ia` (`brecha-ia.exe` en Windows) y `_internal/` con Python, las dependencias
# y las migraciones (en _internal/migraciones/, no en _internal/alembic/, que es el paquete).
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

BASE = Path(SPECPATH)

datas = [(str(BASE / "alembic.ini"), "migraciones")]
for archivo in sorted((BASE / "alembic").rglob("*")):
    if archivo.is_file() and "__pycache__" not in archivo.parts:
        datas.append((str(archivo), str(Path("migraciones") / archivo.parent.relative_to(BASE))))

# Lo que se importa por nombre en tiempo de ejecución y el análisis no ve solo.
hiddenimports = [
    *collect_submodules("ia"),
    *collect_submodules("uvicorn"),  # loops, protocols y lifespan se eligen por nombre ("auto", "on")
    # El llavero de cada sistema: Keychain en macOS, Administrador de credenciales en Windows (con pywin32-ctypes).
    *(
        ["keyring.backends.macOS"]
        if sys.platform == "darwin"
        else ["keyring.backends.Windows", "win32ctypes.pywin32.win32cred", "win32ctypes.core"]
        if sys.platform == "win32"
        else []
    ),
    "psycopg_binary",  # su hook ya junta las extensiones y la libpq
    "sqlalchemy.dialects.postgresql.psycopg",
    "pgvector.sqlalchemy",
    "alembic.runtime.migration",
    "alembic.ddl.postgresql",
    "imapclient",
]

a = Analysis(
    [str(BASE / "src" / "ia" / "entradas" / "servicio.py")],
    pathex=[str(BASE / "src")],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "_tkinter", "pytest", "_pytest", "mypy", "ruff", "IPython", "freezegun"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="brecha-ia",
    debug=False,
    bootloader_ignore_signals=False,  # SIGTERM de la app le llega a uvicorn y al vigía
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch="arm64" if sys.platform == "darwin" else None,
    codesign_identity=None,  # firma ad hoc; la app de escritorio firma el paquete completo
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="brecha-ia",
)
