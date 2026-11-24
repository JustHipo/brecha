import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';

/**
 * Lo que cambia entre macOS y Windows (docs/diseno/windows.md §4), en un solo lugar y con la plataforma
 * como parámetro para poder probarlo desde cualquier sistema.
 */
export type Plataforma = NodeJS.Platform;

const ejecutar = promisify(execFile);

/** Último tramo de una ruta, con `/` o `\` (las rutas de Windows también se prueban desde macOS). */
export function nombreBase(ruta: string): string {
  return ruta.split(/[\\/]/).filter(Boolean).pop() ?? ruta;
}

/** Nombre del ejecutable: en Windows lleva `.exe`. */
export function exe(nombre: string, plataforma: Plataforma = process.platform): string {
  return plataforma === 'win32' ? `${nombre}.exe` : nombre;
}

/** Cómo correr el comando de un hook: `/bin/sh -c` en macOS y Linux, `cmd.exe /d /s /c` en Windows. */
export function comandoDeShell(
  comando: string,
  plataforma: Plataforma = process.platform,
): { programa: string; args: string[]; opciones: { windowsVerbatimArguments?: boolean } } {
  if (plataforma === 'win32') {
    // /d sin AutoRun, /s respeta las comillas del comando tal cual; Node no debe volver a escaparlas.
    return {
      programa: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `"${comando}"`],
      opciones: { windowsVerbatimArguments: true },
    };
  }
  return { programa: '/bin/sh', args: ['-c', comando], opciones: {} };
}

/** ¿Se puede escuchar en 127.0.0.1:puerto? (en Windows falla también si el puerto está en un rango reservado). */
export function puertoDisponible(puerto: number): Promise<boolean> {
  return new Promise((listo) => {
    const s = createServer();
    s.once('error', () => listo(false));
    s.listen({ port: puerto, host: '127.0.0.1', exclusive: true }, () => s.close(() => listo(true)));
  });
}

/** Espera a que el puerto se libere (un proceso recién detenido tarda un momento en soltarlo). */
export async function esperarPuertoDisponible(
  puerto: number,
  intentos = 20,
  pausaMs = 250,
): Promise<boolean> {
  for (let i = 0; i < intentos; i++) {
    if (await puertoDisponible(puerto)) return true;
    await new Promise((r) => setTimeout(r, pausaMs));
  }
  return false;
}

/** Un puerto libre que elige el sistema. */
export function puertoCualquiera(): Promise<number> {
  return new Promise((listo, falla) => {
    const s = createServer();
    s.once('error', falla);
    s.listen({ port: 0, host: '127.0.0.1', exclusive: true }, () => {
      const direccion = s.address();
      const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
      s.close(() => listo(puerto));
    });
  });
}

/**
 * Puerto de PostgreSQL: el preferido (5434) si sirve; si no, el que se usó la vez anterior; si tampoco, uno libre.
 * Se guarda en `instancia/puertos.json`. Solo lo usan el núcleo y la IA, que lo reciben del supervisor; por eso
 * puede cambiar sin tocar nada más. Si PostgreSQL ya está arriba (huérfano), hay que detenerlo antes de llamar esto.
 */
export async function puertoDePostgres(
  instancia: string,
  preferido: number,
  disponible: (p: number) => Promise<boolean> = puertoDisponible,
  cualquiera: () => Promise<number> = puertoCualquiera,
): Promise<number> {
  const ruta = join(instancia, 'puertos.json');
  const guardado = existsSync(ruta)
    ? (JSON.parse(readFileSync(ruta, 'utf8')) as { postgres?: number }).postgres
    : undefined;
  const candidatos = [preferido, ...(guardado && guardado !== preferido ? [guardado] : [])];
  let elegido: number | undefined;
  for (const p of candidatos) {
    if (await disponible(p)) {
      elegido = p;
      break;
    }
  }
  elegido ??= await cualquiera();
  if (elegido !== guardado) {
    mkdirSync(instancia, { recursive: true });
    writeFileSync(ruta, JSON.stringify({ postgres: elegido }));
  }
  return elegido;
}

/** ¿Sigue vivo ese PID? (señal 0: no hace nada, solo revisa). */
export function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Nombre del ejecutable de un PID, para no matar un proceso ajeno que heredó el número. */
export async function nombreDeProceso(
  pid: number,
  plataforma: Plataforma = process.platform,
): Promise<string | null> {
  try {
    if (plataforma === 'win32') {
      const { stdout } = await ejecutar('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        windowsHide: true,
      });
      const m = /^"([^"]+)"/.exec(stdout.trim());
      return m ? m[1]! : null;
    }
    const { stdout } = await ejecutar('ps', ['-p', String(pid), '-o', 'comm=']);
    return stdout.trim() ? nombreBase(stdout.trim()) : null;
  } catch {
    return null;
  }
}

/**
 * Los PID de los procesos hijos, en `instancia/procesos.json`. En Windows los hijos no mueren cuando Electron se
 * cae: al volver a abrir, los de la vez anterior siguen con los puertos tomados y hay que detenerlos.
 */
export class RegistroDePids {
  private readonly ruta: string;

  constructor(instancia: string) {
    this.ruta = join(instancia, 'procesos.json');
  }

  leer(): Record<string, { pid: number; ejecutable: string }> {
    try {
      return JSON.parse(readFileSync(this.ruta, 'utf8')) as Record<
        string,
        { pid: number; ejecutable: string }
      >;
    } catch {
      return {};
    }
  }

  anotar(nombre: string, pid: number | undefined, ejecutable: string): void {
    const todos = this.leer();
    if (pid) todos[nombre] = { pid, ejecutable: nombreBase(ejecutable) };
    else delete todos[nombre];
    writeFileSync(this.ruta, JSON.stringify(todos));
  }

  /** Detiene los procesos de la vez anterior que sigan vivos y sean los mismos ejecutables. Devuelve sus nombres. */
  async detenerHuerfanos(
    nombreDe: (pid: number) => Promise<string | null> = (p) => nombreDeProceso(p),
    matar: (pid: number) => void = (p) => process.kill(p),
    esperaMs = 10_000,
  ): Promise<string[]> {
    const detenidos: string[] = [];
    const pidsDetenidos: number[] = [];
    for (const [nombre, { pid, ejecutable }] of Object.entries(this.leer())) {
      if (pid === process.pid || !vivo(pid)) continue;
      const actual = await nombreDe(pid);
      if (!actual || actual.toLowerCase() !== ejecutable.toLowerCase()) continue;
      try {
        matar(pid);
        detenidos.push(nombre);
        pidsDetenidos.push(pid);
      } catch {
        // ya no estaba
      }
    }
    writeFileSync(this.ruta, '{}');
    // Hasta que mueran de verdad: si no, sus puertos siguen tomados un momento.
    const hasta = Date.now() + esperaMs;
    while (pidsDetenidos.some(vivo) && Date.now() < hasta) await new Promise((r) => setTimeout(r, 100));
    return detenidos;
  }
}

/**
 * Entrada del llavero de la app instalada. En macOS va con la huella del binario (el llavero da permiso por app y
 * un binario sin firma recompilado es «otra app»). En Windows el Administrador de credenciales no tiene permiso por
 * app: con la huella, cada actualización pediría las credenciales de nuevo, así que la entrada es fija.
 */
export function entradaDelLlavero(huella: string | null, plataforma: Plataforma = process.platform): string {
  if (plataforma === 'win32' || !huella) return 'brecha-app';
  return `brecha-app-${huella}`;
}

/** Argumento con el que Windows abre Brecha al iniciar sesión (allá no existe `wasOpenedAtLogin`). */
export const ARGUMENTO_OCULTA = '--oculta';

/** `Brecha --salir` le pide a la Brecha abierta que se cierre (detiene todo en orden). */
export const ARGUMENTO_SALIR = '--salir';

export function abiertaAlIniciarSesion(
  argv: string[],
  wasOpenedAtLogin: boolean | undefined,
  plataforma: Plataforma = process.platform,
): boolean {
  return plataforma === 'win32' ? argv.includes(ARGUMENTO_OCULTA) : !!wasOpenedAtLogin;
}
