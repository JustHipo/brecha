import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  argumentosDePostgres,
  claves,
  crearCluster,
  esperarPostgres,
  migrarNucleo,
  prepararBase,
  urlIa,
  urlNucleo,
} from './base-de-datos';
import { ProcesoSupervisado } from './proceso';
import type { Registro } from './registro';
import { PUERTOS, type Rutas } from './rutas';

export interface Carpetas {
  datos: string; // ~/Library/Application Support/Brecha
  logs: string; // ~/Library/Logs/Brecha
}

/**
 * Levanta todo en orden (modo liviano, ADR 0014): PostgreSQL → migraciones → núcleo → API de IA y vigía.
 * Cada pieza es un proceso hijo supervisado; si una se cae, se reinicia sola.
 */
export class Servicios {
  readonly procesos: ProcesoSupervisado[] = [];
  error: string | null = null;
  readonly instancia: string;

  constructor(
    private readonly r: Rutas,
    private readonly c: Carpetas,
    private readonly registro: Registro,
    private readonly ejecutableNode: string,
    private readonly alCambiar: () => void,
  ) {
    this.instancia = join(c.datos, 'instancia');
  }

  get(nombre: string): ProcesoSupervisado | undefined {
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
    if (!existsSync(join(this.r.postgres, 'bin', 'postgres'))) {
      throw new Error(`No está PostgreSQL en ${this.r.postgres}`);
    }
    if (await crearCluster(this.r.postgres, datos, this.instancia, k)) {
      this.registro.escribir('app', 'base de datos nueva creada');
    }
    const pg = this.agregar({
      nombre: 'postgres',
      comando: join(this.r.postgres, 'bin', 'postgres'),
      args: argumentosDePostgres(datos),
      env: { ...process.env, LC_ALL: 'C' },
      senalDeParada: 'SIGINT',
      listoTras: 60_000,
    });
    pg.iniciar();
    await esperarPostgres(k);
    pg.marcarListo();
    await prepararBase(k);
    const aplicadas = await migrarNucleo(k, join(this.r.nucleo, 'prisma', 'migrations'));
    if (aplicadas.length) this.registro.escribir('app', `migraciones del núcleo: ${aplicadas.join(', ')}`);

    const comun = {
      ...process.env,
      BRECHA_DIR: this.instancia,
      CONSOLA_ORIGEN: `http://127.0.0.1:${PUERTOS.nucleo}`,
      NUCLEO_URL: `http://127.0.0.1:${PUERTOS.nucleo}`,
      BRECHA_LLAVERO: process.env.BRECHA_LLAVERO ?? servicioDelLlavero(this.r.ia),
    };
    await this.migrarIa(k, comun);

    const nucleo = this.agregar({
      nombre: 'nucleo',
      comando: this.ejecutableNode,
      args: [join(this.r.nucleo, 'dist', 'main.js')],
      cwd: this.r.nucleo,
      env: {
        ...comun,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        DATABASE_URL: urlNucleo(k),
        NUCLEO_PUERTO: String(PUERTOS.nucleo),
        CONSOLA_DIR: this.r.consola,
        IA_URL: `http://127.0.0.1:${PUERTOS.ia}`,
      },
      listoTras: 4_000,
    });
    nucleo.iniciar();
    await esperarHttp(`http://127.0.0.1:${PUERTOS.nucleo}/api/v1/salud`);
    nucleo.marcarListo();

    const envIa = {
      ...comun,
      ...certificados(this.r.ia),
      IA_DATABASE_URL: urlIa(k),
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
      await esperarHttp(`http://127.0.0.1:${PUERTOS.ia}/api/ia/salud`, 40);
      iaApi.marcarListo();
    } catch {
      // La IA no es indispensable: el núcleo y la consola funcionan sin ella y el supervisor la sigue intentando.
    }
  }

  private async migrarIa(k: ReturnType<typeof claves>, comun: NodeJS.ProcessEnv): Promise<void> {
    const { execFile } = await import('node:child_process');
    await new Promise<void>((listo, falla) =>
      execFile(
        this.r.ia,
        ['migrar'],
        {
          env: {
            ...comun,
            ...certificados(this.r.ia),
            IA_DATABASE_URL: urlIa(k),
            IA_DATABASE_URL_MIGRAR: urlIa(k),
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
    const p = new ProcesoSupervisado(d, this.registro, this.alCambiar);
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
  throw new Error(`${url} no respondió en 30 segundos`);
}

/**
 * El Python empaquetado no ve los certificados raíz de macOS: sin esto, el IMAP de Gmail falla con
 * CERTIFICATE_VERIFY_FAILED. Se usan los de certifi, que vienen dentro del binario.
 */
export function certificados(ia: string): NodeJS.ProcessEnv {
  const archivo = join(dirname(ia), '_internal', 'certifi', 'cacert.pem');
  return existsSync(archivo) && !process.env.SSL_CERT_FILE ? { SSL_CERT_FILE: archivo } : {};
}

/**
 * Entrada propia en el llavero por cada versión del servicio con IA: la crea ese binario, así que es su dueño
 * y macOS no le pide permiso para leerla. Sin firma de Apple (D39), un binario recompilado es «otra app» para
 * el llavero: con una entrada nueva, Ajustes pide las credenciales una vez en vez de mostrar una ventana de permiso.
 */
export function servicioDelLlavero(ia: string): string {
  if (!existsSync(ia)) return 'brecha-app';
  return `brecha-app-${createHash('sha256').update(readFileSync(ia)).digest('hex').slice(0, 12)}`;
}
