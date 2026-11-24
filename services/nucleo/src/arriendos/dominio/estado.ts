/** Estados de una propiedad y sus saltos (docs/diseno/arriendos.md §5.1, P6 aprobado por Juan). */
export const ESTADOS = [
  'vista',
  'contactada',
  'visita_agendada',
  'visitada',
  'en_evaluacion',
  'aprobada',
  'arrendada',
  'rechazada',
  'descartada',
  'no_disponible',
] as const;

export type EstadoPropiedad = (typeof ESTADOS)[number];

const TRANSICIONES: Readonly<Record<EstadoPropiedad, readonly EstadoPropiedad[]>> = {
  vista: ['contactada', 'visita_agendada', 'descartada', 'no_disponible'],
  contactada: ['visita_agendada', 'en_evaluacion', 'rechazada', 'descartada', 'no_disponible'],
  visita_agendada: ['visitada', 'contactada', 'descartada', 'no_disponible'],
  visitada: ['en_evaluacion', 'descartada', 'no_disponible'],
  en_evaluacion: ['aprobada', 'rechazada', 'descartada', 'no_disponible'],
  aprobada: ['arrendada', 'descartada'],
  arrendada: [],
  rechazada: [],
  descartada: ['vista'],
  no_disponible: ['vista'],
};

/** Orden del embudo, para saber si un movimiento avanza. Los cierres no tienen orden. */
const ORDEN: Partial<Record<EstadoPropiedad, number>> = {
  vista: 0,
  contactada: 1,
  visita_agendada: 2,
  visitada: 3,
  en_evaluacion: 4,
  aprobada: 5,
  arrendada: 6,
};

/** Piden motivo: los cierres que no son tu éxito. */
export const PIDEN_MOTIVO: readonly EstadoPropiedad[] = ['rechazada', 'descartada', 'no_disponible'];

export function esEstado(v: unknown): v is EstadoPropiedad {
  return typeof v === 'string' && (ESTADOS as readonly string[]).includes(v);
}

export function puedeIrA(de: EstadoPropiedad, a: EstadoPropiedad): boolean {
  return TRANSICIONES[de].includes(a);
}

export function destinosDe(de: EstadoPropiedad): EstadoPropiedad[] {
  return [...TRANSICIONES[de]];
}

export function esTerminal(e: EstadoPropiedad): boolean {
  return TRANSICIONES[e].length === 0;
}

/** Estados donde la propiedad ya no se busca: no cuentan en el mapa ni en los pendientes. */
export function estaCerrada(e: EstadoPropiedad): boolean {
  return e === 'arrendada' || e === 'rechazada' || e === 'descartada' || e === 'no_disponible';
}

export function ordenDe(e: EstadoPropiedad): number | undefined {
  return ORDEN[e];
}
