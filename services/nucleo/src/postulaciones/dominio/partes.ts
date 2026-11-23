import type { Fecha } from '../../compartido/dominio/puertos';
import type { EstadoPostulacion } from './estado';
import type { Origen, Plataforma } from './objetos-valor/valores';

export interface Nota {
  readonly id: string;
  readonly texto: string;
  readonly creadaEn: Date;
}

export interface CambioDeEstado {
  readonly id: string;
  readonly de: EstadoPostulacion | null;
  readonly a: EstadoPostulacion;
  readonly motivo?: string;
  readonly origen: Origen;
  readonly ocurridoEn: Date;
}

export const TIPOS_DE_ENTREVISTA = ['rrhh', 'tecnica', 'caso', 'final'] as const;
export type TipoDeEntrevista = (typeof TIPOS_DE_ENTREVISTA)[number];
export const RESULTADOS_DE_ENTREVISTA = ['pendiente', 'avanza', 'no_avanza', 'cancelada'] as const;
export type ResultadoDeEntrevista = (typeof RESULTADOS_DE_ENTREVISTA)[number];

export interface Entrevista {
  readonly id: string;
  readonly fecha: Date;
  readonly tipo: TipoDeEntrevista;
  readonly con?: string;
  readonly resultado: ResultadoDeEntrevista;
}

export const FUENTES_DE_SENAL = ['correo', 'plataforma', 'manual', 'ia'] as const;
export type FuenteDeSenal = (typeof FUENTES_DE_SENAL)[number];

export interface Senal {
  readonly id: string;
  readonly fuente: FuenteDeSenal;
  readonly plataforma: Plataforma;
  readonly resumen: string;
  readonly estadoSugerido?: EstadoPostulacion;
  readonly confianza: number;
  readonly recibidaEn: Date;
  readonly referenciaExterna?: string;
  readonly aplicada: boolean;
}

export type EstadoDeDiscrepancia = 'abierta' | 'confirmada' | 'corregida';
/** Qué fila de la tabla de backend.md §3.2 la abrió. */
export type ReglaDeDiscrepancia = 'senal_de_rechazo' | 'senal_de_avance' | 'sin_evidencia';

export interface Discrepancia {
  readonly id: string;
  readonly cambioId: string;
  readonly senalId?: string;
  readonly regla: ReglaDeDiscrepancia;
  /** `baja` solo informa (movimiento sin evidencia). */
  readonly severidad: 'normal' | 'baja';
  readonly detalle: string;
  readonly estado: EstadoDeDiscrepancia;
  readonly detectadaEn: Date;
  readonly resueltaEn?: Date;
}

export type { Fecha };
