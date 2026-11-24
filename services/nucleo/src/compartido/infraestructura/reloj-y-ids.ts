import { randomBytes } from 'node:crypto';
import type { Fecha, GeneradorId, Reloj } from '../dominio/puertos';

/** Reloj real. `hoy()` usa la zona horaria del equipo: la instancia corre en la máquina de la persona. */
export class RelojDelSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
  hoy(): Fecha {
    return this.fechaDe(new Date());
  }
  fechaDe(d: Date): Fecha {
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }
}

/** UUID v7 (RFC 9562): 48 bits de milisegundos y el resto aleatorio; ordenable por tiempo. */
export class GeneradorUuidV7 implements GeneradorId {
  nuevo(): string {
    const b = randomBytes(16);
    const ms = BigInt(Date.now());
    for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
    b[6] = (b[6]! & 0x0f) | 0x70;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = b.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}
