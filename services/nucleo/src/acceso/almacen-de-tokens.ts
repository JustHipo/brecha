import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Tipos de token (ADR 0019): consola, IA del usuario y servicios internos. */
export type TipoDeToken = 'sesion' | 'mcp' | 'servicio';

const DOCE_HORAS = 12 * 3600_000;

function nuevoToken(): string {
  return randomBytes(32).toString('base64url');
}

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Guarda los tokens en la carpeta de la instancia con permisos 0600.
 * - `token-mcp` y `token-servicio`: duran hasta que se regeneran.
 * - `token-consola`: solo existe si no hay clave local; la ventana de Brecha (o el proxy de
 *   desarrollo) lo lee y lo manda. Con clave, las sesiones se entregan al desbloquear y vencen a las 12 horas.
 */
export class AlmacenDeTokens {
  private fijos = new Map<'mcp' | 'servicio' | 'consola', string>();
  private sesiones = new Map<string, number>();

  constructor(
    private readonly dir: string,
    private readonly ahora: () => number = Date.now,
  ) {}

  iniciar(claveConfigurada: boolean): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    for (const tipo of ['mcp', 'servicio'] as const) this.fijos.set(tipo, this.leerOCrear(`token-${tipo}`));
    this.ajustarAClave(claveConfigurada);
  }

  /** Sin clave hay token de consola en archivo; con clave se borra y se piden sesiones. */
  ajustarAClave(claveConfigurada: boolean): void {
    const ruta = join(this.dir, 'token-consola');
    if (claveConfigurada) {
      rmSync(ruta, { force: true });
      this.fijos.delete('consola');
    } else {
      this.fijos.set('consola', this.leerOCrear('token-consola'));
    }
  }

  emitirSesion(): { token: string; expiraEn: Date } {
    const token = nuevoToken();
    const expira = this.ahora() + DOCE_HORAS;
    this.sesiones.set(token, expira);
    return { token, expiraEn: new Date(expira) };
  }

  /** Devuelve el tipo del token o null. Compara en tiempo constante. */
  identificar(token: string | undefined): TipoDeToken | null {
    if (!token) return null;
    const consola = this.fijos.get('consola');
    if (consola && igual(token, consola)) return 'sesion';
    if (igual(token, this.fijos.get('mcp') ?? '')) return 'mcp';
    if (igual(token, this.fijos.get('servicio') ?? '')) return 'servicio';
    for (const [t, expira] of this.sesiones) {
      if (expira < this.ahora()) this.sesiones.delete(t);
      else if (igual(token, t)) return 'sesion';
    }
    return null;
  }

  regenerar(tipo: 'mcp' | 'servicio'): string {
    const token = nuevoToken();
    this.escribir(`token-${tipo}`, token);
    this.fijos.set(tipo, token);
    return token;
  }

  cerrarSesiones(): void {
    this.sesiones.clear();
  }

  private leerOCrear(nombre: string): string {
    const ruta = join(this.dir, nombre);
    if (existsSync(ruta)) {
      const t = readFileSync(ruta, 'utf8').trim();
      if (t.length >= 40) return t;
    }
    const t = nuevoToken();
    this.escribir(nombre, t);
    return t;
  }

  private escribir(nombre: string, valor: string): void {
    const ruta = join(this.dir, nombre);
    writeFileSync(ruta, `${valor}\n`, { mode: 0o600 });
    chmodSync(ruta, 0o600);
  }
}
