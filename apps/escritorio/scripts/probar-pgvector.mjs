// Prueba que el PostgreSQL de `recursos/postgres` arranca y que pgvector carga y funciona (W3).
// Usa las mismas funciones que la app (dist/base-de-datos.js): initdb, arranque solo TCP y pg_ctl stop.
// La carpeta de datos lleva espacios y tildes, como `C:\Users\Tamara Pérez\AppData\Roaming\Brecha`.
// Uso: pnpm --filter escritorio build && node apps/escritorio/scripts/probar-pgvector.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';

const aqui = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const bd = require(join(aqui, 'dist', 'base-de-datos.js'));
const { exe, puertoCualquiera } = require(join(aqui, 'dist', 'plataforma.js'));

const postgres = join(aqui, 'recursos', 'postgres');
const base = mkdtempSync(join(tmpdir(), 'Brecha Pérez ñ '));
const datos = join(base, 'postgres');
const instancia = join(base, 'instancia');
const claves = bd.claves(instancia);
const puerto = await puertoCualquiera();

console.log(`datos en ${datos}, puerto ${puerto}`);
await bd.crearCluster(postgres, datos, instancia, claves);
// En Windows como lo hace la app: con pg_ctl, que baja los permisos de administrador (el runner del CI los tiene).
const servidor =
  process.platform === 'win32'
    ? (await bd.arrancarConPgCtl(postgres, datos, puerto, join(base, 'postgres.log')), null)
    : spawn(join(postgres, 'bin', exe('postgres')), bd.argumentosDePostgres(datos, puerto), {
        stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true,
      });
let fallo = null;
try {
  await bd.esperarPostgres(claves, puerto);
  await bd.prepararBase(claves, puerto); // crea la extensión vector en el esquema ia, como la app
  const db = new pg.Client({
    host: '127.0.0.1',
    port: puerto,
    user: 'brecha',
    password: claves.brecha,
    database: 'brecha',
  });
  await db.connect();
  const version = await db.query("SELECT version(), extversion FROM pg_extension WHERE extname = 'vector'");
  console.log(version.rows[0]);
  await db.query('CREATE TABLE ia.prueba (id serial PRIMARY KEY, v ia.vector(3))');
  await db.query("INSERT INTO ia.prueba (v) VALUES ('[1,2,3]'), ('[4,5,6]'), ('[1,1,1]')");
  await db.query('CREATE INDEX ON ia.prueba USING hnsw (v ia.vector_l2_ops)');
  const r = await db.query("SELECT id FROM ia.prueba ORDER BY v OPERATOR(ia.<->) '[3,1,2]' LIMIT 1"); // [1,1,1] es el más cercano
  await db.query('DROP TABLE ia.prueba');
  await db.end();
  if (r.rows[0]?.id !== 3) throw new Error(`la búsqueda por cercanía devolvió ${JSON.stringify(r.rows)}`);
  console.log('pgvector funciona: extensión, índice HNSW y búsqueda por cercanía');
} catch (e) {
  fallo = e;
} finally {
  const parado = await bd.detenerPostgres(postgres, datos);
  if (!parado) servidor?.kill();
  rmSync(base, { recursive: true, force: true });
}
if (fallo) {
  console.error(`pgvector NO funciona: ${fallo.message}`);
  process.exit(1);
}
