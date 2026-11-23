import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api/api.service';

/** Si hay clave local y el pedido no está desbloqueado, manda a /desbloquear (ui.md §4.1). */
export const accesoGuard: CanActivateFn = async (_ruta, estado) => {
  const api = inject(Api);
  const router = inject(Router);
  try {
    const a = await firstValueFrom(api.estadoAcceso());
    if (a.claveConfigurada && !a.desbloqueado) {
      return router.createUrlTree(['/desbloquear'], { queryParams: { volver: estado.url } });
    }
    return true;
  } catch {
    // Sin núcleo: la pantalla muestra su propio error de red con «Reintentar».
    return true;
  }
};

/** /desbloquear solo existe si hay clave configurada. */
export const soloConClaveGuard: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  try {
    const a = await firstValueFrom(api.estadoAcceso());
    return a.claveConfigurada && !a.desbloqueado ? true : router.createUrlTree(['/tablero']);
  } catch {
    return true;
  }
};
