// Arma `recursos/postgres`: PostgreSQL 17.12 de @embedded-postgres más pgvector (D36).
// - macOS arm64: pgvector de Homebrew compilado para PostgreSQL 17 (`brew install pgvector`).
// - Windows x64: pgvector compilado con `nmake /F Makefile.win install` contra un PostgreSQL 17.12 con cabeceras
//   (en el CI, el que trae el runner: scripts/compilar-pgvector-windows.ps1). PGVECTOR_DIR apunta a esa
//   instalación (`lib/vector.dll` y `share/extension/vector*`). pgvector no publica binarios para Windows.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const aqui = resolve(import.meta.dirname, '..');
const destino = join(aqui, 'recursos', 'postgres');
const windows = process.platform === 'win32';

// Dónde está cada cosa en cada sistema (las carpetas de PostgreSQL no son iguales).
const plan = windows
  ? {
      paquete: 'windows-x64',
      pgvector: process.env.PGVECTOR_DIR ?? process.env.PGROOT ?? 'C:\\Program Files\\PostgreSQL\\17',
      lib: ['lib', 'vector.dll'],
      share: ['share', 'extension'],
      libDestino: ['lib', 'vector.dll'],
      shareDestino: ['share', 'extension'],
      ayuda: 'Compila pgvector con scripts/compilar-pgvector-windows.ps1 y define PGVECTOR_DIR.',
    }
  : {
      paquete: 'darwin-arm64',
      pgvector: process.env.PGVECTOR_DIR ?? '/opt/homebrew/opt/pgvector',
      lib: ['lib', 'postgresql@17', 'vector.dylib'],
      share: ['share', 'postgresql@17', 'extension'],
      libDestino: ['lib', 'postgresql', 'vector.dylib'],
      shareDestino: ['share', 'postgresql', 'extension'],
      ayuda: 'Instala pgvector con: brew install pgvector',
    };

// El paquete no exporta su package.json: se busca por la carpeta de node_modules.
const origen = join(aqui, 'node_modules', '@embedded-postgres', plan.paquete, 'native');
const vectorLib = join(plan.pgvector, ...plan.lib);
const vectorShare = join(plan.pgvector, ...plan.share);

if (!existsSync(origen)) {
  console.error(`No encuentro ${origen}: corre pnpm install en este sistema (${process.platform}).`);
  process.exit(1);
}
if (!existsSync(vectorLib)) {
  console.error(`No encuentro ${vectorLib}. ${plan.ayuda}`);
  process.exit(1);
}
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
cpSync(origen, destino, { recursive: true, verbatimSymlinks: true });
cpSync(vectorLib, join(destino, ...plan.libDestino));
const extension = join(destino, ...plan.shareDestino);
const archivos = readdirSync(vectorShare).filter((f) => f.startsWith('vector'));
if (!archivos.some((f) => f === 'vector.control')) {
  console.error(`No encuentro vector.control en ${vectorShare}. ${plan.ayuda}`);
  process.exit(1);
}
for (const f of archivos) cpSync(join(vectorShare, f), join(extension, f));
console.log(`PostgreSQL 17 con pgvector listo en ${destino} (${archivos.length} archivos de la extensión)`);
