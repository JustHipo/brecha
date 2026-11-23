/** Códigos estables de error (PLAN §12.1). La infraestructura los traduce a HTTP o a MCP. */
export type CodigoError =
  | 'VALIDACION'
  | 'NO_AUTENTICADO'
  | 'CLAVE_INVALIDA'
  | 'NO_ENCONTRADO'
  | 'YA_EXISTE'
  | 'CONFLICTO'
  | 'TRANSICION_INVALIDA'
  | 'AVISO_CERRADO'
  | 'ESTADO_TERMINAL'
  | 'ERROR_INTERNO';

export abstract class ErrorDeDominio extends Error {
  abstract readonly codigo: CodigoError;

  constructor(
    mensaje: string,
    readonly campo?: string,
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}
