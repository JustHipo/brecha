import type { Routes } from '@angular/router';
import { accesoGuard, soloConClaveGuard } from './nucleo/acceso/acceso.guard';

export const routes: Routes = [
  {
    path: 'desbloquear',
    canActivate: [soloConClaveGuard],
    loadComponent: () => import('./funciones/acceso/desbloquear').then((m) => m.Desbloquear),
  },
  {
    path: '',
    canActivate: [accesoGuard],
    loadComponent: () => import('./funciones/marco/marco').then((m) => m.Marco),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tablero' },
      {
        path: 'tablero',
        loadComponent: () => import('./funciones/tablero/tablero').then((m) => m.TableroPagina),
      },
      {
        path: 'lista',
        loadComponent: () => import('./funciones/lista/lista').then((m) => m.ListaPagina),
      },
      {
        path: 'postulaciones/nueva',
        loadComponent: () =>
          import('./funciones/postulacion/nueva').then((m) => m.NuevaPostulacion),
      },
      {
        path: 'postulaciones/:id',
        loadComponent: () => import('./funciones/postulacion/ficha').then((m) => m.FichaPagina),
      },
    ],
  },
  { path: '**', redirectTo: 'tablero' },
];
