import { SetMetadata } from '@nestjs/common';
import type { TipoDeToken } from './almacen-de-tokens';

export const PUBLICO = 'brecha:publico';
export const TIPOS = 'brecha:tipos-de-token';

/** Ruta sin token (igual pasa por la revisión de Host y Origin). */
export const Publico = () => SetMetadata(PUBLICO, true);
/** Restringe la ruta a ciertos tipos de token. Por defecto se acepta cualquiera válido. */
export const SoloTokens = (...tipos: TipoDeToken[]) => SetMetadata(TIPOS, tipos);

export interface PedidoConAcceso {
  acceso?: { tipo: TipoDeToken };
}
