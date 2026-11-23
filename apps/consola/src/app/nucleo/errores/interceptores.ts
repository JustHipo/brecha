import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SesionLocal } from '../acceso/sesion';
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
  return next(req).pipe(
    catchError((e: unknown) => {
      if (!(e instanceof HttpErrorResponse)) return throwError(() => e);
      if (e.status === 0)
        return throwError(() => new ErrorDeApi('RED', 'Sin conexión con el núcleo', 0));
      const c = (e.error ?? {}) as {
        codigo?: ErrorDeApi['codigo'];
        mensaje?: string;
        campo?: string;
        existenteId?: string;
      };
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
