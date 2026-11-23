import { TestBed } from '@angular/core/testing';
import {
  Router,
  UrlTree,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { of, throwError } from 'rxjs';
import { Api } from '../api/api.service';
import { accesoGuard, soloConClaveGuard } from './acceso.guard';

describe('guards de acceso', () => {
  function con(estado: { claveConfigurada: boolean; desbloqueado: boolean } | Error) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Api,
          useValue: {
            estadoAcceso: () => (estado instanceof Error ? throwError(() => estado) : of(estado)),
          },
        },
      ],
    });
  }
  const correr = (g: typeof accesoGuard, url = '/tablero') =>
    TestBed.runInInjectionContext(() =>
      g({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;

  it('con clave y sin desbloquear, /tablero manda a /desbloquear', async () => {
    con({ claveConfigurada: true, desbloqueado: false });
    const r = await correr(accesoGuard);
    expect(TestBed.inject(Router).serializeUrl(r as UrlTree)).toBe(
      '/desbloquear?volver=%2Ftablero',
    );
  });

  it('sin clave deja pasar', async () => {
    con({ claveConfigurada: false, desbloqueado: true });
    expect(await correr(accesoGuard)).toBe(true);
  });

  it('/desbloquear sin clave manda al tablero', async () => {
    con({ claveConfigurada: false, desbloqueado: true });
    const r = await correr(soloConClaveGuard);
    expect(TestBed.inject(Router).serializeUrl(r as UrlTree)).toBe('/tablero');
  });

  it('si el núcleo no responde deja pasar (la pantalla muestra el error)', async () => {
    con(new Error('red'));
    expect(await correr(accesoGuard)).toBe(true);
  });
});
