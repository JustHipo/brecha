import type { CodigoError } from '@brecha/contratos';

/** Error del núcleo con su `codigo` estable (PLAN §12.1). `RED` si no hubo respuesta. */
export class ErrorDeApi extends Error {
  constructor(
    readonly codigo: CodigoError | 'RED',
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
