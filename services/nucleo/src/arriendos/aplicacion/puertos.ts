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

// ── Fotos (docs/diseno/fotos-propiedades.md) ──

export interface Foto {
  id: string;
  propiedadId: string;
  /** 0 = portada (F-D2). */
  orden: number;
  /** `idFoto.ext`, sin carpetas (F-D4). */
  archivo: string;
  tipo: string;
  bytes: number;
  sha256: string;
  origen: 'url' | 'archivo';
  urlOrigen: string | null;
  nombreOrigen: string | null;
  creadaEn: Date;
}

export interface FotoRepositorio {
  /** Todas, de la portada a la última. */
  dePropiedad(propiedadId: string): Promise<Foto[]>;
  /** Todas las fotos de todas las propiedades, en orden (son pocas: uso personal). */
  todas(): Promise<Foto[]>;
  porId(id: string): Promise<Foto | null>;
  porHuella(propiedadId: string, sha256: string): Promise<Foto | null>;
  crear(f: Foto): Promise<void>;
  /** Cambia la propiedad y el orden de varias en una transacción. */
  actualizar(cambios: { id: string; orden: number; propiedadId?: string }[]): Promise<void>;
  borrar(id: string): Promise<void>;
}

/** La carpeta `<instancia>/fotos` (F-D4). Solo recibe nombres `idFoto.ext`. */
export interface AlmacenDeFotos {
  huella(bytes: Uint8Array): string;
  guardar(archivo: string, bytes: Uint8Array): Promise<void>;
  leer(archivo: string): Promise<Uint8Array | null>;
  /** No falla si ya no estaba. */
  borrar(archivo: string): Promise<void>;
}

/** De dónde salen los bytes: una URL pública (F-D7) o un archivo de tu equipo (F-D9). */
export interface ObtenedorDeImagenes {
  descargar(url: string): Promise<{ bytes: Uint8Array; urlFinal: string }>;
  leerLocal(ruta: string): Promise<{ bytes: Uint8Array; nombre: string }>;
}
