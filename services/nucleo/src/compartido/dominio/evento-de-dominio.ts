export type Prioridad = 'alta' | 'media' | 'baja';

export interface EventoDeDominio<D extends object = object> {
  readonly tipo: string;
  readonly version: 1;
  readonly ocurridoEn: Date;
  readonly prioridad: Prioridad;
  readonly datos: D;
}
