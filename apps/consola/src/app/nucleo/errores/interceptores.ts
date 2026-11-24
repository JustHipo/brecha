import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SesionLocal } from '../acceso/sesion';
import { BASE_IA } from '../api/ia.service';
import { ErrorDeApi } from './error-de-api';

/** Pone el token de sesión si existe. Sin clave, el token lo agrega Electron o el proxy de desarrollo. */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(SesionLocal).actual();
  return next(
    token && !req.headers.has('Authorization')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req,
  );
};

/** Convierte el cuerpo `{codigo, mensaje, campo}` en un `ErrorDeApi`; un 401 manda a desbloquear. */
export const erroresInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const sesion = inject(SesionLocal);
  const esIa = req.url.startsWith(BASE_IA);
  return next(req).pipe(
    catchError((e: unknown) => {
      if (!(e instanceof HttpErrorResponse)) return throwError(() => e);
      const c = (e.error ?? {}) as {
        codigo?: ErrorDeApi['codigo'];
        mensaje?: string;
        campo?: string;
        existenteId?: string;
      };
      if (esIa) return throwError(() => errorDeIa(e, c));
      if (e.status === 0)
        return throwError(() => new ErrorDeApi('RED', 'Sin conexión con el núcleo', 0));
      const err = new ErrorDeApi(
        c.codigo ?? 'ERROR_INTERNO',
        c.mensaje ?? e.message,
        e.status,
        c.campo,
        c.existenteId,
      );
      if (e.status === 401 && err.codigo === 'NO_AUTENTICADO' && !req.url.includes('/acceso/')) {
        sesion.olvidar();
        void router.navigate(['/desbloquear'], { queryParams: { volver: router.url } });
      }
      return throwError(() => err);
    }),
  );
};

/**
 * Errores de la API de IA. Sin cuerpo `{codigo}` y con 0, 500, 502, 503 o 504 es que el servicio
 * está apagado (el proxy responde sin cuerpo). Un 422 de FastAPI trae `detail` y no `codigo`.
 * Un 401 de la IA no cierra la sesión: puede ser el Host o el Origin, no el token.
 */
function errorDeIa(
  e: HttpErrorResponse,
  c: { codigo?: ErrorDeApi['codigo']; mensaje?: string; campo?: string },
): ErrorDeApi {
  if (c.codigo) return new ErrorDeApi(c.codigo, c.mensaje ?? e.message, e.status, c.campo);
  if (e.status === 0 || e.status >= 500)
    return new ErrorDeApi('IA_APAGADA', 'El servicio con IA no responde', e.status);
  if (e.status === 422 || e.status === 400)
    return new ErrorDeApi('VALIDACION', e.message, e.status);
  return new ErrorDeApi('ERROR_INTERNO', e.message, e.status);
}
