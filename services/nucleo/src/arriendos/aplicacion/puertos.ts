import type { Fecha } from '../../compartido/dominio/puertos';
import type { EstadoPropiedad } from '../dominio/estado';
import type { FuenteDeSenal } from '../dominio/valores';

export type { BusquedaRepositorio, CanalRepositorio, PropiedadRepositorio } from '../dominio/puertos';

/** Una señal que llegó sin saber de qué propiedad es (la Bandeja de Arriendos). */
export interface SenalSuelta {
  fuente: FuenteDeSenal;
  canalId?: string;
  resumen: string;
  estadoSugerido?: EstadoPropiedad;
  confianza: number;
  referenciaExterna?: string;
  remitente?: string;
  asunto?: string;
  recibidaEn: string;
  /** Lo que la IA alcanzó a sacar, para encontrar o crear la propiedad. */
  urlDetectada?: string;
  direccionDetectada?: string;
  comunaDetectada?: string;
  contactoDetectado?: { nombre?: string; telefono?: string; correo?: string };
}

export interface SenalPendiente extends SenalSuelta {
  id: string;
  estado: 'pendiente' | 'asociada' | 'descartada';
  propiedadId?: string;
  creadaEn: string;
}

export interface BandejaArriendos {
  /** Idempotente por referencia externa: devuelve null si ya estaba. */
  agregar(s: SenalSuelta, id: string, ahora: Date): Promise<SenalPendiente | null>;
  pendientes(): Promise<SenalPendiente[]>;
  porId(id: string): Promise<SenalPendiente | null>;
  resolver(
    id: string,
    estado: 'asociada' | 'descartada',
    propiedadId: string | null,
    ahora: Date,
  ): Promise<void>;
}

export interface AjustesArriendos {
  /** D27: desde qué confianza una señal automática cambia el estado sola. */
  umbral(): Promise<number>;
  uf(): Promise<{ valor: number; fecha: Fecha } | null>;
  fijarUf(valor: number, fecha: Fecha): Promise<void>;
  /** Si se ubican las direcciones con Nominatim (se puede apagar: la dirección sale de tu equipo). */
  geocodificar(): Promise<boolean>;
  fijarGeocodificar(activo: boolean): Promise<void>;
}

/** Dirección → punto (Nominatim en A6). null si no la encontró. */
export interface Geocodificador {
  ubicar(direccion: string, comuna?: string): Promise<{ lat: number; lon: number } | null>;
}
