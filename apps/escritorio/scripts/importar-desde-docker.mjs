// Pasa tus datos del PostgreSQL de desarrollo (Docker, 127.0.0.1:5433) a la base de la app instalada.
// Uso, con la app abierta al menos una vez (crea su base y aplica las migraciones):
//   node apps/escritorio/scripts/importar-desde-docker.mjs [--forzar]
// Copia solo datos (esquemas nucleo e ia); las tablas ya existen por las migraciones de la app.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const instancia = process.env.BRECHA_DATOS
  ? join(process.env.BRECHA_DATOS, 'instancia')
  : join(homedir(), 'Library', 'Application Support', 'Brecha', 'instancia');
const puerto = Number((process.env.BRECHA_PUERTOS ?? '5434').split(',')[0]);
const contenedor = process.env.BRECHA_CONTENEDOR ?? 'brecha-postgres-1';
const claves = JSON.parse(readFileSync(join(instancia, 'postgres-claves.json'), 'utf8'));

const db = new pg.Client({
  host: '127.0.0.1',
  port: puerto,
  user: 'brecha',
  password: claves.brecha,
  database: 'brecha',
});
await db.connect();
const { rows } = await db.query('SELECT count(*)::int AS n FROM nucleo.postulacion');
if (rows[0].n > 0 && !process.argv.includes('--forzar')) {
  console.error(
    `La app ya tiene ${rows[0].n} postulaciones: no importo para no duplicar (usa --forzar para vaciar y traer).`,
  );
  process.exit(1);
}

console.log(`Leyendo los datos de ${contenedor}…`);
const volcado = execFileSync(
  'docker',
  [
    'exec',
    contenedor,
    'pg_dump',
    '-U',
    'brecha',
    '-d',
    'brecha',
    '--data-only',
    '--inserts',
    '--no-owner',
    '--schema=nucleo',
    '--schema=ia',
    '-T',
    'nucleo._prisma_migrations',
    '-T',
    'ia.alembic_version',
  ],
  { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' },
)
  .split('\n')
  .filter((l) => !l.startsWith('\\')) // \restrict y \unrestrict son comandos de psql, no SQL
  .join('\n');

const tablas = (
  await db.query(
    `SELECT format('%I.%I', schemaname, tablename) AS t FROM pg_tables
     WHERE schemaname IN ('nucleo', 'ia') AND tablename NOT IN ('_prisma_migrations', 'alembic_version')`,
  )
).rows.map((r) => r.t);

await db.query('BEGIN');
try {
  await db.query(`TRUNCATE ${tablas.join(', ')} CASCADE`);
  await db.query('SET session_replication_role = replica'); // el orden de las tablas no importa
  await db.query(volcado);
  await db.query('SET session_replication_role = DEFAULT');
  await db.query('COMMIT');
} catch (e) {
  await db.query('ROLLBACK');
  throw e;
}
const conteo = async (t) => (await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
console.log(
  `Listo: ${await conteo('nucleo.postulacion')} postulaciones, ${await conteo('nucleo.senal')} señales, ` +
    `${await conteo('ia.aviso')} avisos y ${await conteo('ia.correo')} correos revisados.`,
);
await db.end();
