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
      {
        path: 'bandeja',
        loadComponent: () => import('./funciones/bandeja/bandeja').then((m) => m.BandejaPagina),
      },
      {
        path: 'avisos',
        loadComponent: () => import('./funciones/avisos/avisos').then((m) => m.AvisosPagina),
      },
      {
        path: 'avisos/:id',
        loadComponent: () => import('./funciones/avisos/aviso').then((m) => m.AvisoPagina),
      },
      {
        path: 'preguntar',
        loadComponent: () =>
          import('./funciones/preguntar/preguntar').then((m) => m.PreguntarPagina),
      },
      {
        path: 'conexiones',
        loadComponent: () =>
          import('./funciones/conexiones/conexiones').then((m) => m.ConexionesPagina),
      },
    ],
  },
  { path: '**', redirectTo: 'tablero' },
];
