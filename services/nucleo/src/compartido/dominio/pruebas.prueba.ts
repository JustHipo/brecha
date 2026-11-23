// Dobles de prueba de los puertos Reloj y GeneradorId.
import type { Deps, Fecha, GeneradorId, Reloj } from './puertos';

export class RelojFijo implements Reloj {
  constructor(private actual: Date = new Date('2026-11-23T12:00:00Z')) {}
  ahora(): Date {
    return new Date(this.actual);
  }
  hoy(): Fecha {
    return this.actual.toISOString().slice(0, 10);
  }
  avanzarDias(dias: number): void {
    this.actual = new Date(this.actual.getTime() + dias * 86_400_000);
  }
  fijar(fecha: Date): void {
    this.actual = fecha;
  }
}

export class IdsSecuenciales implements GeneradorId {
  private n = 0;
  nuevo(): string {
    this.n += 1;
    return `00000000-0000-7000-8000-${String(this.n).padStart(12, '0')}`;
  }
}

export function depsDePrueba(fecha?: Date): Deps & { reloj: RelojFijo } {
  return { reloj: new RelojFijo(fecha), ids: new IdsSecuenciales() };
}
