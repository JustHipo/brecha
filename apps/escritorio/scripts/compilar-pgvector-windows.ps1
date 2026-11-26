# Compila pgvector para Windows x64 (D36, docs/diseno/windows.md W3) como dice su README oficial:
# `nmake /F Makefile.win` y `nmake /F Makefile.win install` en la consola x64 de Visual Studio, con PGROOT
# apuntando a un PostgreSQL con cabeceras. pgvector no publica binarios para Windows.
#
# En el CI se usa el PostgreSQL que trae el runner (windows-2025: PGROOT = C:\Program Files\PostgreSQL\17).
# Debe ser 17.12, la misma versión del PostgreSQL embebido de la app; si no, falla (ahí: zip de EDB 17.12-1).
# Deja vector.dll en $PGROOT\lib y vector.control + vector--*.sql en $PGROOT\share\extension.
param(
  [string]$Version = 'v0.8.7',
  [string]$PostgresEsperado = '17.12'
)
$ErrorActionPreference = 'Stop'

if (-not $env:PGROOT) { throw 'Falta PGROOT (la carpeta de un PostgreSQL 17 con include\ y lib\)' }
$pgConfig = Join-Path $env:PGROOT 'bin\pg_config.exe'
$versionPg = (& $pgConfig --version).Trim()
Write-Host "PostgreSQL para compilar: $versionPg en $env:PGROOT"
if ($versionPg -ne "PostgreSQL $PostgresEsperado") {
  throw "Se esperaba PostgreSQL $PostgresEsperado (el de la app) y el runner trae '$versionPg'"
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'No encuentro Visual Studio con las herramientas de C++ x64' }
$vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
Write-Host "Visual Studio: $vs"

$fuente = Join-Path $env:RUNNER_TEMP 'pgvector'
if (Test-Path $fuente) { Remove-Item -Recurse -Force $fuente }
git clone --quiet --depth 1 --branch $Version https://github.com/pgvector/pgvector.git $fuente
if ($LASTEXITCODE -ne 0) { throw "git clone de pgvector $Version falló" }

cmd /c "call `"$vcvars`" >nul && cd /d `"$fuente`" && nmake /nologo /F Makefile.win && nmake /nologo /F Makefile.win install"
if ($LASTEXITCODE -ne 0) { throw "nmake de pgvector falló ($LASTEXITCODE)" }

$dll = Join-Path $env:PGROOT 'lib\vector.dll'
if (-not (Test-Path $dll)) { throw "No quedó $dll" }
Get-ChildItem (Join-Path $env:PGROOT 'share\extension\vector*') | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host "pgvector $Version compilado: $dll"
