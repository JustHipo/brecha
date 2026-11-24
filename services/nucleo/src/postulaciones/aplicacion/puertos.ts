import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import type { EstadoPostulacion } from '../dominio/estado';
import type { Plataforma } from '../dominio/objetos-valor/valores';
import type { ElementoResumen, VistaDetalle, VistaExportacion, VistaResumen, VistaTablero } from './vistas';

export interface FiltrosPostulaciones {
  estados?: EstadoPostulacion[];
  plataformas?: Plataforma[];
  prioridades?: Prioridad[];
  /** La postulación debe tener todas estas etiquetas (ya normalizadas). */
  etiquetas?: string[];
  q?: string;
}

export interface EtiquetaEnUso {
  etiqueta: string;
  total: number;
}

export interface Pagina {
  limit: number;
  offset: number;
}

/** Lado de lectura (backend.md §4, C7): vistas planas, sin cargar agregados. */
export interface ConsultasDePostulaciones {
  listar(filtros: FiltrosPostulaciones, pagina: Pagina): Promise<{ items: VistaResumen[]; total: number }>;
  tablero(filtros?: Pick<FiltrosPostulaciones, 'etiquetas'>): Promise<VistaTablero>;
  etiquetasEnUso(): Promise<EtiquetaEnUso[]>;
  detalle(id: string): Promise<VistaDetalle | null>;
  resumenDesde(desde: Date): Promise<ElementoResumen[]>;
  exportar(): Promise<VistaExportacion>;
}

/** Ajustes de la instancia (R11). */
export interface Ajustes {
  aplicarSenalesSeguras(): Promise<boolean>;
  umbralConfianza(): Promise<number>;
}
