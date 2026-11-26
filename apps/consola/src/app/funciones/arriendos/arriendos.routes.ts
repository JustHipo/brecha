import type { Routes } from '@angular/router';

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
    path: 'perfil',
    data: { foco: 'arriendos' },
    loadComponent: () => import('../perfil/perfil').then((m) => m.PerfilPagina),
  },
  // «Tu búsqueda» pasó a ser el Perfil (docs/diseno/perfil.md §5).
  { path: 'busqueda', redirectTo: 'perfil' },
  {
    path: 'importar',
    loadComponent: () => import('./importar').then((m) => m.ArriendosImportarPagina),
  },
  {
    path: 'preguntar',
    loadComponent: () => import('./preguntar').then((m) => m.ArriendosPreguntarPagina),
  },
  {
    path: 'mapa',
    loadComponent: () => import('./mapa').then((m) => m.ArriendosMapaPagina),
  },
  { path: '**', redirectTo: 'tablero' },
];
