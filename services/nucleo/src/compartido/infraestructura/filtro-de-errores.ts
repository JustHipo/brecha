import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorDeDominio, type CodigoError } from '../dominio/error-de-dominio';

/** Tabla de PLAN §12.1. */
export const HTTP_POR_CODIGO: Record<CodigoError, number> = {
  VALIDACION: 400,
  NO_AUTENTICADO: 401,
  CLAVE_INVALIDA: 401,
  NO_ENCONTRADO: 404,
  YA_EXISTE: 409,
  CONFLICTO: 409,
  TRANSICION_INVALIDA: 422,
  AVISO_CERRADO: 422,
  ESTADO_TERMINAL: 422,
  ERROR_INTERNO: 500,
};

export interface CuerpoDeError {
  codigo: CodigoError;
  mensaje: string;
  campo?: string;
  existenteId?: string;
}

/** Convierte cualquier error al cuerpo `{codigo, mensaje, campo?}`. Sin stack hacia afuera. */
export function aCuerpoDeError(error: unknown): { status: number; cuerpo: CuerpoDeError } {
  if (error instanceof ErrorDeDominio) {
    const extra = (error as { existenteId?: string }).existenteId;
    return {
      status: HTTP_POR_CODIGO[error.codigo],
      cuerpo: {
        codigo: error.codigo,
        mensaje: error.message,
        ...(error.campo ? { campo: error.campo } : {}),
        ...(extra ? { existenteId: extra } : {}),
      },
    };
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const r = error.getResponse() as { message?: string | string[] } | string;
    const detalle = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message[0] : r.message;
    if (status === 404) return { status, cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' } };
    if (status === 401 || status === 403) {
      return { status: 401, cuerpo: { codigo: 'NO_AUTENTICADO', mensaje: detalle ?? 'No autenticado' } };
    }
    if (status < 500) {
      const campo = typeof detalle === 'string' ? /^(?:property )?([\w.[\]]+)/.exec(detalle)?.[1] : undefined;
      return {
        status: 400,
        cuerpo: { codigo: 'VALIDACION', mensaje: detalle ?? 'Datos inválidos', ...(campo ? { campo } : {}) },
      };
    }
  }
  return { status: 500, cuerpo: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno' } };
}

@Catch()
export class FiltroDeErrores implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost): void {
    const { status, cuerpo } = aCuerpoDeError(error);
    if (status === 500) this.log.error(error instanceof Error ? error.stack : String(error));
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    res.status(status).json(cuerpo);
  }
}
