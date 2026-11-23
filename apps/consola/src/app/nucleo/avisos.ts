import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { toast } from '@spartan-ng/brain/sonner';
import { ErrorDeApi } from './errores/error-de-api';

/** Toasts traducidos (ui.md §4.7). Los errores de red van en una banda persistente, no aquí. */
@Injectable({ providedIn: 'root' })
export class Avisos {
  private readonly t = inject(TranslocoService);

  exito(
    clave: string,
    params?: Record<string, unknown>,
    accion?: { clave: string; hacer: () => void },
  ): void {
    toast.success(
      this.t.translate(clave, params),
      accion ? { action: { label: this.t.translate(accion.clave), onClick: accion.hacer } } : {},
    );
  }

  aviso(
    clave: string,
    params?: Record<string, unknown>,
    accion?: { clave: string; hacer: () => void },
  ): void {
    toast.warning(
      this.t.translate(clave, params),
      accion ? { action: { label: this.t.translate(accion.clave), onClick: accion.hacer } } : {},
    );
  }

  error(e: unknown): void {
    const err = e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0);
    const descripcion = err.campo
      ? this.t.translate('errores.campo', { campo: err.campo })
      : undefined;
    toast.error(this.t.translate(err.clave), descripcion ? { description: descripcion } : {});
  }
}
