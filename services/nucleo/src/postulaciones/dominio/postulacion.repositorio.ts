import type { Postulacion } from './postulacion';

/** Puerto de salida. R4 (una activa por aviso) y R10 (versión) se cumplen aquí. */
export interface PostulacionRepositorio {
  porId(id: string): Promise<Postulacion | null>;
  /**
   * Guarda el agregado y sus eventos en el outbox en una sola transacción.
   * Lanza `ConflictoDeVersion` si la versión cambió y `PostulacionDuplicada` si choca con R4.
   */
  guardar(postulacion: Postulacion): Promise<void>;
}
