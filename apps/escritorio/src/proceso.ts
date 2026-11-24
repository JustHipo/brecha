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

/** Un proceso hijo supervisado: si se cae, se reinicia con esperas crecientes; si sigue cayendo, queda «fallando». */
export class ProcesoSupervisado {
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
