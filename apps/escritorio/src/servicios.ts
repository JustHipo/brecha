import { createHash } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  argumentosDePostgres,
  arrancarConPgCtl,
  claves,
  crearCluster,
  detenerPostgres,
  esperarPostgres,
  migrarNucleo,
  postgresCorriendo,
  prepararBase,
  urlIa,
  urlNucleo,
} from './base-de-datos';
import {
  entradaDelLlavero,
  exe,
  puertoDePostgres,
  esperarPuertoDisponible,
  RegistroDePids,
  vivo,
} from './plataforma';
import { ProcesoPorArranque, ProcesoSupervisado, type Supervisado } from './proceso';
import type { Registro } from './registro';
import { PUERTOS, type Rutas } from './rutas';

export interface Carpetas {
  datos: string; // macOS: ~/Library/Application Support/Brecha · Windows: %APPDATA%\Brecha
  logs: string; // macOS: ~/Library/Logs/Brecha · Windows: %APPDATA%\Brecha\logs
}

/**
 * Levanta todo en orden (modo liviano, ADR 0014): PostgreSQL → migraciones → núcleo → API de IA y vigía.
 * Cada pieza es un proceso hijo supervisado; si una se cae, se reinicia sola.
 */
export class Servicios {
  readonly procesos: Supervisado[] = [];
  error: string | null = null;
  readonly instancia: string;
  /** Puerto de PostgreSQL de esta instancia (5434 o el libre que se eligió, ver puertoDePostgres). */
  puertoPostgres: number = PUERTOS.postgres;
  private pids: RegistroDePids | null = null;

  constructor(
    private readonly r: Rutas,
    private readonly c: Carpetas,
    private readonly registro: Registro,
    private readonly ejecutableNode: string,
    private readonly alCambiar: () => void,
  ) {
    this.instancia = join(c.datos, 'instancia');
  }

  get(nombre: string): Supervisado | undefined {
    return this.procesos.find((p) => p.nombre === nombre);
  }

  async iniciar(): Promise<void> {
    this.error = null;
    try {
      await this.iniciarTodo();
    } catch (e) {
      this.error = (e as Error).message;
      this.registro.escribir('app', `no se pudo iniciar: ${this.error}`);
      this.alCambiar();
    }
  }

  private async iniciarTodo(): Promise<void> {
    mkdirSync(this.instancia, { recursive: true, mode: 0o700 });
    const datos = join(this.c.datos, 'postgres');
    const k = claves(this.instancia);
    const binPostgres = join(this.r.postgres, 'bin', exe('postgres'));
    if (!existsSync(binPostgres)) {
      throw new Error(`No está PostgreSQL en ${this.r.postgres}`);
    }
    // Lo que quedó vivo de la vez anterior (en Windows los hijos no mueren con la app): primero el núcleo y la IA,
    // que tienen conexiones abiertas, y después PostgreSQL con un cierre limpio.
    this.pids = new RegistroDePids(this.instancia);
    const huerfanos = await this.pids.detenerHuerfanos(undefined, undefined, undefined, ['postgres']);
    if (await postgresCorriendo(this.r.postgres, datos)) {
      const parado = await detenerPostgres(this.r.postgres, datos);
      huerfanos.push(parado ? 'postgres' : 'postgres (no respondió a pg_ctl stop)');
    }
    if (huerfanos.length)
      this.registro.escribir('app', `procesos de la vez anterior detenidos: ${huerfanos.join(', ')}`);
    for (const [nombre, puerto] of [
      ['el núcleo', PUERTOS.nucleo],
      ['el servicio con IA', PUERTOS.ia],
    ] as const) {
      if (!(await esperarPuertoDisponible(puerto))) {
        throw new Error(
          `El puerto ${puerto} (${nombre}) lo está usando otra aplicación: ciérrala y reinicia Brecha`,
        );
      }
    }
    this.puertoPostgres = await puertoDePostgres(this.instancia, PUERTOS.postgres);
    if (this.puertoPostgres !== PUERTOS.postgres) {
      this.registro.escribir(
        'app',
        `el puerto ${PUERTOS.postgres} no está disponible: PostgreSQL usa el ${this.puertoPostgres}`,
      );
    }
    const puerto = this.puertoPostgres;
    if (await crearCluster(this.r.postgres, datos, this.instancia, k)) {
      this.registro.escribir('app', 'base de datos nueva creada');
    }
    const pg =
      process.platform === 'win32'
        ? // Windows: PostgreSQL no corre con permisos de administrador elevados; pg_ctl los baja (ver arrancarConPgCtl).
          this.agregarPorArranque({
            nombre: 'postgres',
            arrancar: () =>
              arrancarConPgCtl(this.r.postgres, datos, puerto, join(this.c.logs, 'postgres.log')),
            parar: async () => {
              await detenerPostgres(this.r.postgres, datos);
            },
            vivo,
            ejecutable: binPostgres,
          })
        : this.agregar({
            nombre: 'postgres',
            comando: binPostgres,
            args: argumentosDePostgres(datos, puerto),
            env: { ...process.env, LC_ALL: 'C' },
            senalDeParada: 'SIGINT',
            detenerCon: async () => {
              if (!(await detenerPostgres(this.r.postgres, datos))) throw new Error('pg_ctl stop falló');
            },
            listoTras: 60_000,
          });
    pg.iniciar();
    await esperarPostgres(k, puerto);
    pg.marcarListo();
    await prepararBase(k, puerto);
    const aplicadas = await migrarNucleo(k, puerto, join(this.r.nucleo, 'prisma', 'migrations'));
    if (aplicadas.length) this.registro.escribir('app', `migraciones del núcleo: ${aplicadas.join(', ')}`);

    const comun = {
      ...process.env,
      BRECHA_DIR: this.instancia,
      CONSOLA_ORIGEN: `http://127.0.0.1:${PUERTOS.nucleo}`,
      NUCLEO_URL: `http://127.0.0.1:${PUERTOS.nucleo}`,
      BRECHA_LLAVERO: process.env.BRECHA_LLAVERO ?? servicioDelLlavero(this.r.ia),
      // En Windows Python escribe en la página de códigos del sistema; el registro lee UTF-8.
      PYTHONUTF8: '1',
    };
    await this.migrarIa(k, comun);
    await this.migrarLlavero(comun);

    const nucleo = this.agregar({
      nombre: 'nucleo',
      comando: this.ejecutableNode,
      args: [join(this.r.nucleo, 'dist', 'main.js')],
      cwd: this.r.nucleo,
      env: {
        ...comun,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        DATABASE_URL: urlNucleo(k, puerto),
        NUCLEO_PUERTO: String(PUERTOS.nucleo),
        CONSOLA_DIR: this.r.consola,
        IA_URL: `http://127.0.0.1:${PUERTOS.ia}`,
      },
      listoTras: 4_000,
    });
    nucleo.iniciar();
    // El primer arranque en un Windows recién instalado puede tardar más de un minuto: el antivirus revisa
    // los ~29 mil archivos la primera vez que se cargan. Se espera hasta 5 minutos.
    await esperarHttp(`http://127.0.0.1:${PUERTOS.nucleo}/api/v1/salud`, 600);
    nucleo.marcarListo();

    const envIa = {
      ...comun,
      ...certificados(this.r.ia),
      IA_DATABASE_URL: urlIa(k, puerto),
      IA_PUERTO: String(PUERTOS.ia),
    };
    const iaApi = this.agregar({
      nombre: 'ia-api',
      comando: this.r.ia,
      args: ['api'],
      env: envIa,
      listoTras: 5_000,
    });
    iaApi.iniciar();
    this.agregar({
      nombre: 'vigia',
      comando: this.r.ia,
      args: ['vigia'],
      env: envIa,
      listoTras: 5_000,
    }).iniciar();
    try {
      await esperarHttp(`http://127.0.0.1:${PUERTOS.ia}/api/ia/salud`, 240);
      iaApi.marcarListo();
    } catch {
      // La IA no es indispensable: el núcleo y la consola funcionan sin ella y el supervisor la sigue intentando.
    }
  }

  /** Una actualización cambió la entrada del llavero: se copian las credenciales a la nueva (D63). */
  private async migrarLlavero(comun: NodeJS.ProcessEnv): Promise<void> {
    const actual = comun.BRECHA_LLAVERO;
    if (!actual) return;
    const anterior = entradaAnteriorDelLlavero(this.instancia, actual);
    if (!anterior) return;
    await new Promise<void>((listo) =>
      execFile(
        this.r.ia,
        ['credenciales', 'migrar'],
        { windowsHide: true, env: { ...comun, BRECHA_LLAVERO_ANTERIOR: anterior } },
        (e, salida, errores) => {
          this.registro.escribir(
            'app',
            `llavero: de ${anterior} a ${actual}. ${salida}${e ? ` ${errores}` : ''}`,
          );
          listo();
        },
      ),
    );
  }

  private async migrarIa(k: ReturnType<typeof claves>, comun: NodeJS.ProcessEnv): Promise<void> {
    await new Promise<void>((listo, falla) =>
      execFile(
        this.r.ia,
        ['migrar'],
        {
          windowsHide: true,
          env: {
            ...comun,
            ...certificados(this.r.ia),
            IA_DATABASE_URL: urlIa(k, this.puertoPostgres),
            IA_DATABASE_URL_MIGRAR: urlIa(k, this.puertoPostgres),
          },
        },
        (e, salida, errores) => {
          this.registro.escribir('ia-migrar', `${salida}\n${errores}`);
          if (e) falla(new Error(`Las migraciones de la IA fallaron (ver ia-migrar.log)`));
          else listo();
        },
      ),
    );
  }

  private agregar(d: ConstructorParameters<typeof ProcesoSupervisado>[0]): ProcesoSupervisado {
    const previo = this.get(d.nombre);
    if (previo) this.procesos.splice(this.procesos.indexOf(previo), 1);
    const pids = this.pids;
    const p = new ProcesoSupervisado(
      { ...d, alLanzar: (pid) => pids?.anotar(d.nombre, pid, d.comando) },
      this.registro,
      this.alCambiar,
    );
    this.procesos.push(p);
    return p;
  }

  private agregarPorArranque(
    d: Omit<ConstructorParameters<typeof ProcesoPorArranque>[0], 'alLanzar'> & { ejecutable: string },
  ): ProcesoPorArranque {
    const previo = this.get(d.nombre);
    if (previo) this.procesos.splice(this.procesos.indexOf(previo), 1);
    const pids = this.pids;
    const p = new ProcesoPorArranque(
      { ...d, alLanzar: (pid) => pids?.anotar(d.nombre, pid, d.ejecutable) },
      this.registro,
      this.alCambiar,
    );
    this.procesos.push(p);
    return p;
  }

  /** Para todo en orden inverso: primero la IA y el núcleo, al final PostgreSQL (apagado limpio). */
  async detener(): Promise<void> {
    const orden = ['vigia', 'ia-api', 'nucleo', 'postgres'];
    for (const nombre of orden) await this.get(nombre)?.detener();
  }
}

export async function esperarHttp(url: string, intentos = 60): Promise<void> {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // todavía no escucha
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} no respondió en ${Math.round(intentos / 2)} segundos`);
}

/**
 * El Python empaquetado no ve los certificados raíz de macOS: sin esto, el IMAP de Gmail falla con
 * CERTIFICATE_VERIFY_FAILED. Se usan los de certifi, que vienen dentro del binario.
 */
export function certificados(ia: string): NodeJS.ProcessEnv {
  const archivo = join(dirname(ia), '_internal', 'certifi', 'cacert.pem');
  return existsSync(archivo) && !process.env.SSL_CERT_FILE ? { SSL_CERT_FILE: archivo } : {};
}

/** Entrada fija del llavero en macOS cuando brecha-ia está firmado con una identidad (D63). */
export const ENTRADA_FIRMADA_MAC = 'brecha-mac';

/**
 * ¿Está firmado con una identidad real (no ad hoc)? `codesign -dvv` muestra «Authority=…» solo con una identidad
 * (con -dv no sale) y «Signature=adhoc» con la firma ad hoc. Sale por stderr.
 */
export function firmadoConIdentidad(ia: string): boolean {
  const r = spawnSync('codesign', ['-dvv', ia], { encoding: 'utf8' });
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return r.status === 0 && /^Authority=/m.test(salida) && !/Signature=adhoc/.test(salida);
}

/**
 * Entrada del llavero del servicio con IA.
 * - Windows: fija (el Administrador de credenciales no tiene permiso por app).
 * - macOS con brecha-ia firmado con una identidad estable (D63): fija, `brecha-mac`. El llavero reconoce el
 *   mismo certificado en cada versión y no vuelve a pedir nada al actualizar.
 * - macOS con firma ad hoc (D39, el .dmg del CI): una entrada por huella del binario, porque cada binario
 *   recompilado es «otra app» para el llavero; Ajustes pide las credenciales una vez.
 */
export function servicioDelLlavero(
  ia: string,
  plataforma: NodeJS.Platform = process.platform,
  firmado: (ia: string) => boolean = firmadoConIdentidad,
): string {
  if (plataforma === 'win32' || !existsSync(ia)) return entradaDelLlavero(null, plataforma);
  if (plataforma === 'darwin' && firmado(ia)) return ENTRADA_FIRMADA_MAC;
  return entradaDelLlavero(
    createHash('sha256').update(readFileSync(ia)).digest('hex').slice(0, 12),
    plataforma,
  );
}

/**
 * Si la entrada del llavero cambió desde la vez anterior (una actualización), copia a la nueva lo que falte
 * con `brecha-ia credenciales migrar`, sin mostrar valores. Guarda la entrada actual en `instancia/llavero.json`.
 */
export function entradaAnteriorDelLlavero(instancia: string, actual: string): string | null {
  const ruta = join(instancia, 'llavero.json');
  let anterior: string | null = null;
  try {
    anterior = (JSON.parse(readFileSync(ruta, 'utf8')) as { servicio?: string }).servicio ?? null;
  } catch {
    // primera vez
  }
  writeFileSync(ruta, JSON.stringify({ servicio: actual }));
  return anterior && anterior !== actual ? anterior : null;
}
