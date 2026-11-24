import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { exe } from './plataforma';

const ejecutar = promisify(execFile);

export interface Claves {
  brecha: string;
  nucleo: string;
  ia: string;
}

/** Claves de los usuarios de la base local, generadas una vez y guardadas con permisos 0600. */
export function claves(instancia: string): Claves {
  const ruta = join(instancia, 'postgres-claves.json');
  if (existsSync(ruta)) return JSON.parse(readFileSync(ruta, 'utf8')) as Claves;
  const nueva = () => randomBytes(24).toString('base64url');
  const c = { brecha: nueva(), nucleo: nueva(), ia: nueva() };
  mkdirSync(instancia, { recursive: true });
  writeFileSync(ruta, JSON.stringify(c), { mode: 0o600 });
  return c;
}

export const urlNucleo = (c: Claves, puerto: number) =>
  `postgresql://nucleo:${c.nucleo}@127.0.0.1:${puerto}/brecha?schema=nucleo`;
export const urlIa = (c: Claves, puerto: number) =>
  `postgresql+psycopg://ia:${c.ia}@127.0.0.1:${puerto}/brecha`;

const conexion = (puerto: number, usuario: string, clave: string, base = 'brecha') =>
  new Client({ host: '127.0.0.1', port: puerto, user: usuario, password: clave, database: base });

/** `initdb` la primera vez, con autenticación scram y la clave del superusuario en un archivo temporal. */
export async function crearCluster(
  postgres: string,
  datos: string,
  instancia: string,
  c: Claves,
): Promise<boolean> {
  if (existsSync(join(datos, 'PG_VERSION'))) return false;
  mkdirSync(datos, { recursive: true });
  const archivo = join(instancia, '.initdb-clave');
  writeFileSync(archivo, c.brecha, { mode: 0o600 });
  try {
    await ejecutar(join(postgres, 'bin', exe('initdb')), [
      '-D',
      datos,
      '-U',
      'brecha',
      `--pwfile=${archivo}`,
      '--auth=scram-sha-256',
      '-E',
      'UTF8',
      '--locale=C',
    ]);
  } catch (e) {
    rmSync(datos, { recursive: true, force: true });
    throw e;
  } finally {
    rmSync(archivo, { force: true });
  }
  return true;
}

/**
 * Detiene un PostgreSQL con `pg_ctl stop -m fast` (cierre limpio). En Windows es la única forma: Node mata en seco
 * con cualquier señal. Sirve también para uno huérfano de la vez anterior: `pg_ctl` lo encuentra por postmaster.pid.
 */
export async function detenerPostgres(postgres: string, datos: string, esperaSeg = 20): Promise<boolean> {
  try {
    await ejecutar(
      join(postgres, 'bin', exe('pg_ctl')),
      ['stop', '-D', datos, '-m', 'fast', '-w', '-t', String(esperaSeg)],
      { windowsHide: true },
    );
    return true;
  } catch {
    return false;
  }
}

/** ¿Hay un PostgreSQL corriendo sobre esa carpeta? (`pg_ctl status` sale con 0 si sí). */
export async function postgresCorriendo(postgres: string, datos: string): Promise<boolean> {
  if (!existsSync(join(datos, 'postmaster.pid'))) return false;
  try {
    await ejecutar(join(postgres, 'bin', exe('pg_ctl')), ['status', '-D', datos], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** El PID del postmaster según postmaster.pid (primera línea), o null si no está. */
export function pidDePostgres(datos: string): number | null {
  try {
    const pid = Number(readFileSync(join(datos, 'postmaster.pid'), 'utf8').split(/\r?\n/)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Windows: PostgreSQL se niega a correr con permisos de administrador elevados («Execution of PostgreSQL by a user
 * with administrative permissions is not permitted») y `pg_ctl start` es lo que sabe bajarlos (token restringido).
 * Arranca, espera a que acepte conexiones y devuelve el PID del postmaster. El registro va a `log`.
 */
export async function arrancarConPgCtl(
  postgres: string,
  datos: string,
  puerto: number,
  log: string,
): Promise<number> {
  const opciones = argumentosDePostgres(datos, puerto, 'win32').slice(2).join(' ');
  await ejecutar(
    join(postgres, 'bin', exe('pg_ctl')),
    ['start', '-D', datos, '-w', '-t', '60', '-l', log, '-o', opciones],
    { windowsHide: true },
  );
  const pid = pidDePostgres(datos);
  if (!pid) throw new Error('PostgreSQL arrancó pero no dejó postmaster.pid');
  return pid;
}

/** Solo TCP en 127.0.0.1: sin socket Unix (su ruta no puede pasar de 103 caracteres en macOS). */
export function argumentosDePostgres(
  datos: string,
  puerto: number,
  plataforma: NodeJS.Platform = process.platform,
): string[] {
  return [
    '-D',
    datos,
    '-p',
    String(puerto),
    // En Windows no hace falta (y un valor vacío no pasa bien por `pg_ctl -o`).
    ...(plataforma === 'win32' ? [] : ['-c', 'unix_socket_directories=']),
    '-c',
    'listen_addresses=127.0.0.1',
    '-c',
    'max_connections=40',
  ];
}

export async function esperarPostgres(c: Claves, puerto: number, intentos = 60): Promise<void> {
  for (let i = 0; i < intentos; i++) {
    const cliente = conexion(puerto, 'brecha', c.brecha, 'postgres');
    try {
      await cliente.connect();
      await cliente.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('PostgreSQL no respondió en 30 segundos');
}

/**
 * Lo mismo que `infra/postgres/init/01-esquemas.sh` en desarrollo: la base `brecha`, un usuario y un esquema
 * por servicio y pgvector en el esquema `ia`. Idempotente: también corrige claves si cambiaron.
 */
export async function prepararBase(c: Claves, puerto: number): Promise<void> {
  const admin = conexion(puerto, 'brecha', c.brecha, 'postgres');
  await admin.connect();
  try {
    const existe = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'brecha'");
    if (!existe.rowCount) await admin.query('CREATE DATABASE brecha OWNER brecha');
  } finally {
    await admin.end();
  }
  const db = conexion(puerto, 'brecha', c.brecha);
  await db.connect();
  try {
    for (const rol of ['nucleo', 'ia'] as const) {
      const r = await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [rol]);
      const clave = c[rol].replace(/'/g, "''");
      await db.query(`${r.rowCount ? 'ALTER' : 'CREATE'} ROLE ${rol} LOGIN PASSWORD '${clave}'`);
    }
    await db.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await db.query('CREATE SCHEMA IF NOT EXISTS nucleo AUTHORIZATION nucleo');
    await db.query('CREATE SCHEMA IF NOT EXISTS ia AUTHORIZATION ia');
    await db.query('CREATE EXTENSION IF NOT EXISTS vector SCHEMA ia');
    await db.query('GRANT CONNECT ON DATABASE brecha TO nucleo, ia');
    await db.query('ALTER ROLE nucleo IN DATABASE brecha SET search_path = nucleo');
    await db.query('ALTER ROLE ia IN DATABASE brecha SET search_path = ia, public');
  } finally {
    await db.end();
  }
}

/**
 * Aplica las migraciones del núcleo (prisma/migrations) con la misma tabla `_prisma_migrations` que Prisma,
 * para no llevar el CLI de Prisma dentro de la app. Cada migración corre en una transacción.
 */
export async function migrarNucleo(c: Claves, puerto: number, carpeta: string): Promise<string[]> {
  const db = conexion(puerto, 'nucleo', c.nucleo);
  await db.connect();
  const aplicadas: string[] = [];
  try {
    await db.query('SET search_path = nucleo');
    await db.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
    const hechas = new Set(
      (
        await db.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')
      ).rows.map((f: { migration_name: string }) => f.migration_name),
    );
    const nombres = readdirSync(carpeta, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(carpeta, d.name, 'migration.sql')))
      .map((d) => d.name)
      .sort();
    for (const nombre of nombres.filter((n) => !hechas.has(n))) {
      const sql = readFileSync(join(carpeta, nombre, 'migration.sql'), 'utf8');
      await db.query('BEGIN');
      try {
        await db.query(sql);
        await db.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
           VALUES ($1, $2, now(), $3, 1)`,
          [crypto.randomUUID(), createHash('sha256').update(sql).digest('hex'), nombre],
        );
        await db.query('COMMIT');
        aplicadas.push(nombre);
      } catch (e) {
        await db.query('ROLLBACK');
        throw new Error(`La migración ${nombre} falló: ${(e as Error).message}`, { cause: e });
      }
    }
  } finally {
    await db.end();
  }
  return aplicadas;
}
