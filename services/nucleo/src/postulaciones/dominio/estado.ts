/** Estados de una postulación y su tabla de transiciones (PLAN §11.2). */
export const ESTADOS = [
  'sin_decidir',
  'por_postular',
  'postulado',
  'en_proceso',
  'entrevista',
  'oferta',
  'aceptada',
  'rechazado',
  'descartado',
] as const;

export type EstadoPostulacion = (typeof ESTADOS)[number];

const TRANSICIONES: Readonly<Record<EstadoPostulacion, readonly EstadoPostulacion[]>> = {
  sin_decidir: ['por_postular', 'postulado', 'descartado'],
  por_postular: ['postulado', 'sin_decidir', 'descartado'],
  postulado: ['en_proceso', 'entrevista', 'rechazado', 'descartado'],
  en_proceso: ['entrevista', 'rechazado', 'descartado'],
  entrevista: ['oferta', 'rechazado', 'descartado'],
  oferta: ['aceptada', 'rechazado', 'descartado'],
  descartado: ['sin_decidir'],
  rechazado: [],
  aceptada: [],
};

/** Estados de avance, en orden. Sirven para R13 (backend.md §3.2). */
export const ESTADOS_DE_AVANCE: readonly EstadoPostulacion[] = [
  'postulado',
  'en_proceso',
  'entrevista',
  'oferta',
];

const ORDEN: Readonly<Partial<Record<EstadoPostulacion, number>>> = {
  sin_decidir: 0,
  por_postular: 1,
  postulado: 2,
  en_proceso: 3,
  entrevista: 4,
  oferta: 5,
  aceptada: 6,
};

export function esEstado(valor: unknown): valor is EstadoPostulacion {
  return typeof valor === 'string' && (ESTADOS as readonly string[]).includes(valor);
}

export function puedeIrA(de: EstadoPostulacion, a: EstadoPostulacion): boolean {
  return TRANSICIONES[de].includes(a);
}

export function destinosDe(de: EstadoPostulacion): EstadoPostulacion[] {
  return [...TRANSICIONES[de]];
}

/** `rechazado` y `aceptada` no tienen salida (R8). `descartado` se puede reabrir. */
export function esTerminal(estado: EstadoPostulacion): boolean {
  return TRANSICIONES[estado].length === 0;
}

export function esDeAvance(estado: EstadoPostulacion): boolean {
  return ESTADOS_DE_AVANCE.includes(estado);
}

/** Posición en el embudo; `rechazado` y `descartado` no tienen orden. */
export function ordenDe(estado: EstadoPostulacion): number | undefined {
  return ORDEN[estado];
}
