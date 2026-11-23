/** Fecha sin hora en formato ISO `AAAA-MM-DD`. Se compara como texto. */
export type Fecha = string;

/** Puerto del reloj: el dominio nunca usa `new Date()` (PLAN §11.3). */
export interface Reloj {
  ahora(): Date;
  /** La fecha de hoy en la zona horaria de la instancia. */
  hoy(): Fecha;
}

/** Puerto del generador de identificadores (UUID v7). */
export interface GeneradorId {
  nuevo(): string;
}

export interface Deps {
  reloj: Reloj;
  ids: GeneradorId;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esFecha(valor: string): boolean {
  if (!FECHA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

/** Días enteros de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: Fecha, hasta: Fecha): number {
  const ms = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
