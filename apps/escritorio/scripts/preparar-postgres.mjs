// Arma `recursos/postgres`: PostgreSQL 17 de @embedded-postgres/darwin-arm64 más pgvector (D36).
// pgvector sale del pgvector de Homebrew compilado para PostgreSQL 17 (`brew install pgvector`).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const aqui = resolve(import.meta.dirname, '..');
const destino = join(aqui, 'recursos', 'postgres');
// El paquete no exporta su package.json: se busca por la carpeta de node_modules.
const origen = join(aqui, 'node_modules', '@embedded-postgres', 'darwin-arm64', 'native');
const pgvector = process.env.PGVECTOR_DIR ?? '/opt/homebrew/opt/pgvector';
const vectorLib = join(pgvector, 'lib', 'postgresql@17', 'vector.dylib');
const vectorShare = join(pgvector, 'share', 'postgresql@17', 'extension');

if (!existsSync(vectorLib)) {
  console.error(`No encuentro ${vectorLib}. Instala pgvector con: brew install pgvector`);
  process.exit(1);
}
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
cpSync(origen, destino, { recursive: true, verbatimSymlinks: true });
cpSync(vectorLib, join(destino, 'lib', 'postgresql', 'vector.dylib'));
const extension = join(destino, 'share', 'postgresql', 'extension');
for (const f of readdirSync(vectorShare).filter((f) => f.startsWith('vector'))) {
  cpSync(join(vectorShare, f), join(extension, f));
}
console.log(`PostgreSQL 17 con pgvector listo en ${destino}`);
