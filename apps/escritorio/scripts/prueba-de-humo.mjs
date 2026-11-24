// Prueba de humo de la app empaquetada (docs/diseno/windows.md W4), en Windows y en macOS:
//  1. (Windows, con --instalador) instala en silencio, por usuario, sin administrador.
//  2. Abre Brecha con los datos en una carpeta con espacios y tildes.
//  3. Espera al núcleo y al servicio con IA (modo liviano y completo: la ventana abierta con la consola).
//  4. Revisa pgvector en la base, crea una postulación y la mueve en el tablero por la API.
//  5. (Windows) guarda, lee y borra una credencial de prueba en el Administrador de credenciales.
//  6. Mata Brecha en seco, la vuelve a abrir (limpia los procesos huérfanos) y la cierra con --salir.
//  7. Revisa que no quede ningún proceso y que PostgreSQL haya cerrado limpio.
//
// Uso: node prueba-de-humo.mjs --app <Brecha.exe | Brecha.app/Contents/MacOS/Brecha> [--instalador <Setup.exe>]
//      [--salida <carpeta para captura y registros>]
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';

const windows = process.platform === 'win32';
const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const salida = resolve(arg('--salida') ?? mkdtempSync(join(tmpdir(), 'humo-')));
mkdirSync(salida, { recursive: true });
const datos = mkdtempSync(join(tmpdir(), 'Brecha Pérez ñ '));
// BRECHA_PUERTOS=«pg,núcleo,ia» permite probar al lado de una Brecha instalada (como en la app).
const [, pNucleo, pIa] = (process.env.BRECHA_PUERTOS ?? ',4300,4400').split(',');
const NUCLEO = `http://127.0.0.1:${pNucleo}`;
const IA = `http://127.0.0.1:${pIa}`;
const pasos = [];
const paso = (texto) => {
  pasos.push(texto);
  console.log(`✔ ${texto}`);
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarHttp(url, segundos) {
  for (let i = 0; i < segundos; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // todavía no
    }
    await esperar(1000);
  }
  throw new Error(`${url} no respondió en ${segundos} s`);
}

let app = arg('--app');
const instalador = arg('--instalador');
if (instalador) {
  if (!windows) throw new Error('--instalador es solo para Windows');
  execFileSync(instalador, ['/S'], { stdio: 'inherit' });
  const candidatos = ['Brecha', 'escritorio'].map((d) =>
    join(process.env.LOCALAPPDATA, 'Programs', d, 'Brecha.exe'),
  );
  app = candidatos.find((c) => existsSync(c));
  if (!app) throw new Error(`El instalador no dejó Brecha.exe en ${candidatos.join(' ni en ')}`);
  paso(`instalada por usuario en ${app}`);
}
if (!app || !existsSync(app)) throw new Error(`No encuentro la app: ${app}`);

const env = { ...process.env, BRECHA_DATOS: datos, BRECHA_CAPTURA: join(salida, 'ventana.png') };
delete env.ELECTRON_RUN_AS_NODE;
const abrir = () => {
  const hijo = spawn(app, [], { env, detached: true, stdio: 'ignore' });
  hijo.unref();
  return hijo;
};

/** Los PID que la app anotó de sus procesos hijos (instancia/procesos.json). */
function pidsDeLaApp() {
  try {
    return Object.values(JSON.parse(readFileSync(join(datos, 'instancia', 'procesos.json'), 'utf8'))).map(
      (p) => p.pid,
    );
  } catch {
    return [];
  }
}
function vivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

let fallo = null;
let primera;
try {
  primera = abrir();
  await esperarHttp(`${NUCLEO}/api/v1/salud`, 180);
  paso('modo liviano: PostgreSQL, migraciones y núcleo arriba');
  await esperarHttp(`${IA}/api/ia/salud`, 120);
  paso('servicio con IA arriba (API y vigía)');

  const instancia = join(datos, 'instancia');
  const token = readFileSync(join(instancia, 'token-consola'), 'utf8').trim();
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const consola = await fetch(`${NUCLEO}/tablero`);
  if (!consola.ok || !(await consola.text()).includes('<app-root')) throw new Error('la consola no se sirve');
  paso('la consola se sirve desde el núcleo');

  const claves = JSON.parse(readFileSync(join(instancia, 'postgres-claves.json'), 'utf8'));
  const puerto = existsSync(join(instancia, 'puertos.json'))
    ? JSON.parse(readFileSync(join(instancia, 'puertos.json'), 'utf8')).postgres
    : 5434;
  const db = new pg.Client({
    host: '127.0.0.1',
    port: puerto,
    user: 'brecha',
    password: claves.brecha,
    database: 'brecha',
  });
  await db.connect();
  const ext = await db.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
  const cerca = await db.query("SELECT ia.l2_distance('[1,2,3]'::ia.vector, '[1,2,4]'::ia.vector) AS d");
  await db.end();
  if (!ext.rowCount || Number(cerca.rows[0].d) !== 1) throw new Error('pgvector no está o no calcula bien');
  paso(`pgvector ${ext.rows[0].extversion} en la base (puerto ${puerto})`);

  let r = await fetch(`${NUCLEO}/api/v1/postulaciones`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      aviso: {
        titulo: 'Desarrolladora backend (prueba de humo)',
        empresa: 'Ficticia SpA',
        url: 'https://ejemplo.test/aviso/humo',
        plataforma: 'otra',
        modalidad: 'remoto',
        ubicacion: 'Santiago',
      },
      estado: 'por_postular',
    }),
  });
  if (r.status !== 201) throw new Error(`crear postulación respondió ${r.status}: ${await r.text()}`);
  const creada = await r.json();
  paso(`postulación creada en «por postular» (${creada.id})`);
  r = await fetch(`${NUCLEO}/api/v1/postulaciones/${creada.id}/transiciones`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      a: 'postulado',
      fechaPostulacion: new Date().toISOString().slice(0, 10),
      canal: { tipo: 'portal', valor: 'https://ejemplo.test/aviso/humo' },
      origen: 'tablero',
      version: creada.version,
    }),
  });
  if (!r.ok) throw new Error(`mover la postulación respondió ${r.status}: ${await r.text()}`);
  const tablero = await (await fetch(`${NUCLEO}/api/v1/postulaciones/tablero`, { headers: h })).json();
  const columna = JSON.stringify(tablero.columnas.find((c) => c.estado === 'postulado'));
  if (!columna.includes(creada.id)) throw new Error('la postulación no quedó en la columna «postulado»');
  paso('postulación movida a «postulado» en el tablero');

  if (windows) {
    const ia = join(resolve(app, '..'), 'resources', 'ia', 'brecha-ia.exe');
    const envLlavero = { ...process.env, BRECHA_LLAVERO: 'brecha-prueba-de-humo' };
    execFileSync(ia, ['credenciales', 'importar'], {
      env: envLlavero,
      input: JSON.stringify({
        usuario: 'prueba@ejemplo.test',
        clave: 'abcdefghijklmnop',
        openai: 'sk-prueba-de-humo-123456',
      }),
    });
    const estado = execFileSync(ia, ['credenciales', 'estado'], { env: envLlavero, encoding: 'utf8' });
    const cmdkey = execFileSync('cmdkey', ['/list'], { encoding: 'utf8' });
    execFileSync(ia, ['credenciales', 'borrar'], { env: envLlavero });
    const despues = execFileSync('cmdkey', ['/list'], { encoding: 'utf8' });
    if (!/Correo: configurado/.test(estado) || !/OpenAI: configurado/.test(estado))
      throw new Error(`el llavero no guardó: ${estado}`);
    if (!cmdkey.includes('brecha-prueba-de-humo'))
      throw new Error('la credencial no aparece en el Administrador de credenciales');
    if (despues.includes('brecha-prueba-de-humo')) throw new Error('la credencial no se borró');
    if (cmdkey.includes('abcdefghijklmnop')) throw new Error('cmdkey muestra el secreto');
    paso('credenciales guardadas, leídas y borradas en el Administrador de credenciales de Windows');
  }

  for (let i = 0; i < 30 && !existsSync(join(salida, 'ventana.png')); i++) await esperar(1000);
  if (!existsSync(join(salida, 'ventana.png'))) throw new Error('la ventana no se abrió (sin captura)');
  paso('modo completo: la ventana abrió la consola (captura en ventana.png)');

  // Cierre a la fuerza: los hijos quedan huérfanos; al volver a abrir, la app debe detenerlos y levantar todo.
  process.kill(primera.pid, 'SIGKILL');
  await esperar(2000);
  abrir();
  await esperarHttp(`${NUCLEO}/api/v1/salud`, 180);
  await esperarHttp(`${IA}/api/ia/salud`, 120);
  const app_log = readFileSync(join(datos, 'logs', 'app.log'), 'utf8');
  if (!/vez anterior/.test(app_log)) throw new Error('no se detectaron los procesos de la vez anterior');
  paso('tras matar Brecha en seco, se volvió a abrir y limpió los procesos huérfanos');

  const hijos = pidsDeLaApp();
  if (hijos.length !== 4) throw new Error(`se esperaban 4 procesos hijos y hay ${hijos.length}`);
  execFileSync(app, ['--salir'], { env, timeout: 30_000 });
  for (let i = 0; i < 30 && hijos.some(vivo); i++) await esperar(1000);
  const vivos = hijos.filter(vivo);
  if (vivos.length) throw new Error(`quedaron procesos vivos después de salir: ${vivos.join(', ')}`);
  const pgLog = readFileSync(join(datos, 'logs', 'postgres.log'), 'utf8');
  if (!/database system is shut down/.test(pgLog.split('received fast shutdown request').pop() ?? ''))
    throw new Error('PostgreSQL no cerró limpio');
  paso('«--salir» cerró todo y PostgreSQL apagó limpio');
} catch (e) {
  fallo = e;
} finally {
  if (existsSync(join(datos, 'logs'))) cpSync(join(datos, 'logs'), join(salida, 'logs'), { recursive: true });
}
console.log(`\n${pasos.length} pasos bien. Registros y captura en ${salida}`);
if (fallo) {
  console.error(`✘ ${fallo.message}`);
  process.exit(1);
}
