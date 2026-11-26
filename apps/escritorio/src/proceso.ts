import { spawn, type ChildProcess } from 'node:child_process';
import type { Registro } from './registro';

export type EstadoDeProceso = 'detenido' | 'iniciando' | 'corriendo' | 'reiniciando' | 'fallando';

export interface DefinicionDeProceso {
  nombre: string;
  comando: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  /** Cuánto esperar antes de darlo por arriba si no hay otra señal (ms). */
  listoTras?: number;
  /** Señal para pararlo bien (en Windows Node mata en seco con cualquier señal). */
  senalDeParada?: NodeJS.Signals;
  /** Cómo pararlo bien si no basta una señal (PostgreSQL: `pg_ctl stop -m fast`, también en Windows). */
  detenerCon?: () => Promise<unknown>;
  /** Avisa el PID de cada lanzamiento (undefined al terminar), para detener huérfanos la próxima vez. */
  alLanzar?: (pid: number | undefined) => void;
}

const ESPERAS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];

/** Lo que el supervisor y el menú necesitan de cada pieza, la lance como la lance. */
export interface Supervisado {
  readonly nombre: string;
  estado: EstadoDeProceso;
  ultimoError: string | null;
  iniciar(): void;
  marcarListo(): void;
  detener(): Promise<void>;
}

/** Un proceso hijo supervisado: si se cae, se reinicia con esperas crecientes; si sigue cayendo, queda «fallando». */
export class ProcesoSupervisado implements Supervisado {
  estado: EstadoDeProceso = 'detenido';
  ultimoError: string | null = null;
  private hijo: ChildProcess | null = null;
  private caidas = 0;
  private parando = false;
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private readonly d: DefinicionDeProceso,
    private readonly registro: Registro,
    private readonly alCambiar: () => void,
  ) {}

  get nombre(): string {
    return this.d.nombre;
  }

  iniciar(): void {
    this.parando = false;
    this.lanzar();
  }

  private lanzar(): void {
    this.cambiar('iniciando');
    const hijo = spawn(this.d.comando, this.d.args, {
      env: this.d.env,
      ...(this.d.cwd ? { cwd: this.d.cwd } : {}),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true, // en Windows, sin una ventana de consola por cada proceso
    });
    this.hijo = hijo;
    this.d.alLanzar?.(hijo.pid);
    const anotar = (b: Buffer) => this.registro.escribir(this.d.nombre, b.toString());
    hijo.stdout?.on('data', anotar);
    hijo.stderr?.on('data', anotar);
    const arriba = setTimeout(() => {
      if (this.hijo === hijo && this.estado === 'iniciando') {
        this.caidas = 0;
        this.cambiar('corriendo');
      }
    }, this.d.listoTras ?? 3_000);
    hijo.on('error', (e) => {
      this.ultimoError = e.message;
      this.registro.escribir(this.d.nombre, `no se pudo lanzar: ${e.message}`);
    });
    hijo.on('exit', (codigo, senal) => {
      clearTimeout(arriba);
      if (this.hijo !== hijo) return;
      this.hijo = null;
      this.d.alLanzar?.(undefined);
      if (this.parando) {
        this.cambiar('detenido');
        return;
      }
      this.ultimoError = `terminó con ${senal ?? `código ${codigo}`}`;
      this.registro.escribir(this.d.nombre, `se cayó: ${this.ultimoError}`);
      const espera = ESPERAS[Math.min(this.caidas, ESPERAS.length - 1)]!;
      this.caidas += 1;
      this.cambiar(this.caidas > 5 ? 'fallando' : 'reiniciando');
      this.temporizador = setTimeout(() => this.lanzar(), espera);
    });
  }

  marcarListo(): void {
    if (this.estado === 'iniciando') {
      this.caidas = 0;
      this.cambiar('corriendo');
    }
  }

  async detener(esperaMs = 10_000): Promise<void> {
    this.parando = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    const hijo = this.hijo;
    if (!hijo) {
      this.cambiar('detenido');
      return;
    }
    await new Promise<void>((listo) => {
      const matar = setTimeout(() => hijo.kill('SIGKILL'), esperaMs);
      hijo.once('exit', () => {
        clearTimeout(matar);
        listo();
      });
      if (this.d.detenerCon) {
        void this.d.detenerCon().catch(() => hijo.kill(this.d.senalDeParada ?? 'SIGTERM'));
      } else {
        hijo.kill(this.d.senalDeParada ?? 'SIGTERM');
      }
    });
  }

  private cambiar(e: EstadoDeProceso): void {
    this.estado = e;
    this.alCambiar();
  }
}

export interface DefinicionPorArranque {
  nombre: string;
  /** Lo arranca y devuelve su PID (por ejemplo `pg_ctl start -w` y postmaster.pid). */
  arrancar: () => Promise<number>;
  /** Lo para bien (por ejemplo `pg_ctl stop -m fast`). */
  parar: () => Promise<void>;
  /** ¿Sigue vivo ese PID? */
  vivo: (pid: number) => boolean;
  alLanzar?: (pid: number | undefined) => void;
  /** Cada cuánto revisar que siga vivo (ms). */
  cadaMs?: number;
}

/**
 * Una pieza que no es hija directa del supervisor: la arranca otro programa y se vigila por su PID.
 * Es el caso de PostgreSQL en Windows, que se niega a correr con permisos de administrador elevados y solo
 * `pg_ctl` sabe bajarlos (token restringido). Si se cae, se vuelve a arrancar con las mismas esperas.
 */
export class ProcesoPorArranque implements Supervisado {
  estado: EstadoDeProceso = 'detenido';
  ultimoError: string | null = null;
  private pid: number | null = null;
  private caidas = 0;
  private parando = false;
  private vigia: NodeJS.Timeout | null = null;
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private readonly d: DefinicionPorArranque,
    private readonly registro: Registro,
    private readonly alCambiar: () => void,
  ) {}

  get nombre(): string {
    return this.d.nombre;
  }

  iniciar(): void {
    this.parando = false;
    void this.lanzar();
  }

  private async lanzar(): Promise<void> {
    this.cambiar('iniciando');
    try {
      const pid = await this.d.arrancar();
      if (this.parando) return;
      this.pid = pid;
      this.d.alLanzar?.(pid);
      this.caidas = 0;
      this.cambiar('corriendo');
      this.vigia = setInterval(() => this.revisar(), this.d.cadaMs ?? 2_000);
    } catch (e) {
      this.ultimoError = (e as Error).message;
      this.registro.escribir('app', `${this.d.nombre} no arrancó: ${this.ultimoError}`);
      this.reintentar();
    }
  }

  private revisar(): void {
    if (this.parando || this.pid === null || this.d.vivo(this.pid)) return;
    if (this.vigia) clearInterval(this.vigia);
    this.vigia = null;
    this.pid = null;
    this.d.alLanzar?.(undefined);
    this.ultimoError = 'terminó solo';
    this.registro.escribir('app', `${this.d.nombre} se cayó`);
    this.reintentar();
  }

  private reintentar(): void {
    if (this.parando) return;
    const espera = ESPERAS[Math.min(this.caidas, ESPERAS.length - 1)]!;
    this.caidas += 1;
    this.cambiar(this.caidas > 5 ? 'fallando' : 'reiniciando');
    this.temporizador = setTimeout(() => void this.lanzar(), espera);
  }

  /** El arranque ya espera a que acepte conexiones: no hay nada más que marcar. */
  marcarListo(): void {}

  async detener(): Promise<void> {
    this.parando = true;
    if (this.vigia) clearInterval(this.vigia);
    if (this.temporizador) clearTimeout(this.temporizador);
    this.vigia = null;
    if (this.pid !== null) {
      await this.d.parar();
      this.d.alLanzar?.(undefined);
    }
    this.pid = null;
    this.cambiar('detenido');
  }

  private cambiar(e: EstadoDeProceso): void {
    this.estado = e;
    this.alCambiar();
  }
}
