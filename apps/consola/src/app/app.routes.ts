import { inject } from '@angular/core';
import type { Routes } from '@angular/router';
import { accesoGuard, soloConClaveGuard } from './nucleo/acceso/acceso.guard';
import { Foco } from './nucleo/foco/foco';

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
      // La app abre en el último foco que usaste (docs/diseno/arriendos.md, A-D3).
      { path: '', pathMatch: 'full', redirectTo: () => inject(Foco).inicioRecordado() },
      {
        path: 'arriendos',
        loadChildren: () => import('./funciones/arriendos/arriendos.routes').then((m) => m.RUTAS),
      },
      {
        path: 'mapa',
        loadComponent: () => import('./funciones/mapa/mapa-empleo').then((m) => m.MapaEmpleoPagina),
      },
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
        path: 'red',
        loadComponent: () => import('./funciones/red/red').then((m) => m.RedPagina),
      },
      {
        path: 'red/:id',
        loadComponent: () => import('./funciones/red/contacto').then((m) => m.ContactoRedPagina),
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
      {
        path: 'importar',
        loadComponent: () => import('./funciones/csv/csv').then((m) => m.CsvPagina),
      },
      {
        path: 'ajustes',
        loadComponent: () =>
          import('./funciones/recorrido/ajustes-con-recorrido').then((m) => m.AjustesConRecorrido),
      },
    ],
  },
  { path: '**', redirectTo: 'tablero' },
];
