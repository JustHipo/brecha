import type { PrismaClient } from '../../../compartido/infraestructura/prisma';
import type { Ajustes } from '../../aplicacion/puertos';

/** Ajustes guardados en la tabla `ajuste` (se editan desde la pantalla de Ajustes en F3). */
export class PrismaAjustes implements Ajustes {
  constructor(private readonly prisma: PrismaClient) {}

  private async valor(clave: string): Promise<unknown> {
    const fila = await this.prisma.ajuste.findUnique({ where: { clave } });
    return fila?.valor;
  }

  async aplicarSenalesSeguras(): Promise<boolean> {
    return (await this.valor('aplicar_senales_seguras')) === true;
  }

  async umbralConfianza(): Promise<number> {
    const v = await this.valor('umbral_confianza');
    return typeof v === 'number' && v >= 0 && v <= 1 ? v : 0.9;
  }
}
