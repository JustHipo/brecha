import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import type { EstadoPostulacion } from '../dominio/estado';
import type { Plataforma } from '../dominio/objetos-valor/valores';
import type { ElementoResumen, VistaDetalle, VistaExportacion, VistaResumen, VistaTablero } from './vistas';

export interface FiltrosPostulaciones {
  estados?: EstadoPostulacion[];
  plataformas?: Plataforma[];
  prioridades?: Prioridad[];
  q?: string;
}

export interface Pagina {
  limit: number;
  offset: number;
}

/** Lado de lectura (backend.md §4, C7): vistas planas, sin cargar agregados. */
export interface ConsultasDePostulaciones {
  listar(filtros: FiltrosPostulaciones, pagina: Pagina): Promise<{ items: VistaResumen[]; total: number }>;
  tablero(): Promise<VistaTablero>;
  detalle(id: string): Promise<VistaDetalle | null>;
  resumenDesde(desde: Date): Promise<ElementoResumen[]>;
  exportar(): Promise<VistaExportacion>;
}

/** Ajustes de la instancia (R11). */
export interface Ajustes {
  aplicarSenalesSeguras(): Promise<boolean>;
  umbralConfianza(): Promise<number>;
}
