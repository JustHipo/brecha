export const PRIORIDADES = ['alta', 'media', 'baja'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export interface EventoDeDominio<D extends object = object> {
  readonly tipo: string;
  readonly version: 1;
  readonly ocurridoEn: Date;
  readonly prioridad: Prioridad;
  readonly datos: D;
}
