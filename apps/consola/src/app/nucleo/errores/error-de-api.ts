import type { CodigoError } from '@brecha/contratos';

/**
 * Códigos propios de la API de IA (F2). La validación usa `VALIDACION`, como el núcleo.
 * `IA_APAGADA` lo pone la consola cuando el servicio con IA no responde (el proxy devuelve 500 o
 * 502 sin cuerpo, o no hay red).
 */
export type CodigoErrorIa =
  'IA_NO_DISPONIBLE' | 'NUCLEO_NO_DISPONIBLE' | 'CREDENCIAL_INVALIDA' | 'PROHIBIDO' | 'IA_APAGADA';

/** Error del núcleo con su `codigo` estable (PLAN §12.1). `RED` si no hubo respuesta. */
export class ErrorDeApi extends Error {
  constructor(
    readonly codigo: CodigoError | CodigoErrorIa | 'RED',
    mensaje: string,
    readonly status: number,
    readonly campo?: string,
    readonly existenteId?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
  }

  /** Clave de idioma para mostrarlo (`errores.TRANSICION_INVALIDA`). */
  get clave(): string {
    return `errores.${this.codigo}`;
  }
}

export function esErrorDeApi(e: unknown): e is ErrorDeApi {
  return e instanceof ErrorDeApi;
}
