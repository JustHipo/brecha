import type { Routes } from '@angular/router';

const vacia = (titulo: string) => ({
  loadComponent: () => import('./en-preparacion').then((m) => m.EnPreparacion),
  data: { titulo },
});

/** Rutas del foco Arriendos (docs/diseno/arriendos.md §8). */
export const RUTAS: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tablero' },
  {
    path: 'tablero',
    loadComponent: () => import('./tablero').then((m) => m.ArriendosTableroPagina),
  },
  {
    path: 'lista',
    loadComponent: () => import('./paginas').then((m) => m.ArriendosListaPagina),
  },
  {
    path: 'propiedades/nueva',
    loadComponent: () => import('./nueva').then((m) => m.NuevaPropiedadPagina),
  },
  {
    path: 'propiedades/:id',
    loadComponent: () => import('./ficha').then((m) => m.FichaPropiedadPagina),
  },
  {
    path: 'bandeja',
    loadComponent: () => import('./paginas').then((m) => m.ArriendosBandejaPagina),
  },
  {
    path: 'canales',
    loadComponent: () => import('./paginas').then((m) => m.ArriendosCanalesPagina),
  },
  {
    path: 'busqueda',
    loadComponent: () => import('./paginas').then((m) => m.ArriendosBusquedaPagina),
  },
  { path: 'mapa', ...vacia('nav.mapa') },
  { path: 'preguntar', ...vacia('nav.preguntar') },
  { path: '**', redirectTo: 'tablero' },
];
