import { hash, verify } from 'argon2';
import type { PrismaClient } from '../compartido/infraestructura/prisma';
import type { AlmacenDeTokens } from './almacen-de-tokens';
import { DatoInvalido } from '../postulaciones/dominio/errores';
import { ClaveInvalida } from './errores';

/** Clave local opcional con argon2id (ADR 0010) y emisión de sesiones (ADR 0019). */
export class AccesoService {
  private claveConfigurada = false;

  constructor(
    private readonly prisma: PrismaClient,
    readonly tokens: AlmacenDeTokens,
  ) {}

  async iniciar(): Promise<void> {
    this.claveConfigurada = Boolean((await this.prisma.acceso.findUnique({ where: { id: 1 } }))?.claveHash);
    this.tokens.iniciar(this.claveConfigurada);
  }

  get hayClave(): boolean {
    return this.claveConfigurada;
  }

  async desbloquear(clave: string): Promise<{ token: string; expiraEn: Date }> {
    const fila = await this.prisma.acceso.findUnique({ where: { id: 1 } });
    if (!fila?.claveHash) throw new DatoInvalido('clave', 'No hay clave configurada');
    const ok = typeof clave === 'string' && clave.length > 0 && (await verify(fila.claveHash, clave));
    if (!ok) {
      await new Promise((r) => setTimeout(r, 400)); // frena los intentos seguidos
      throw new ClaveInvalida();
    }
    return this.tokens.emitirSesion();
  }

  /** Configura o quita la clave (CLI `pnpm --filter nucleo clave`; desde Ajustes en F3). */
  async fijarClave(nueva: string | null): Promise<void> {
    const claveHash = nueva ? await hash(nueva, { type: 2 }) : null;
    await this.prisma.acceso.upsert({
      where: { id: 1 },
      create: { id: 1, claveHash, actualizadaEn: new Date() },
      update: { claveHash, actualizadaEn: new Date() },
    });
    this.claveConfigurada = Boolean(claveHash);
    this.tokens.cerrarSesiones();
    this.tokens.ajustarAClave(this.claveConfigurada);
  }
}
