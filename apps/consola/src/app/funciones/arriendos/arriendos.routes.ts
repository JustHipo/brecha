import type { Routes } from '@angular/router';

const vacia = (titulo: string) => ({
  loadComponent: () => import('./en-preparacion').then((m) => m.EnPreparacion),
  data: { titulo },
});

/** Rutas del foco Arriendos (docs/diseno/arriendos.md §8). */
export const RUTAS: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tablero' },
  { path: 'tablero', ...vacia('nav.tablero') },
  { path: 'lista', ...vacia('nav.lista') },
  { path: 'mapa', ...vacia('nav.mapa') },
  { path: 'bandeja', ...vacia('nav.bandeja') },
  { path: 'canales', ...vacia('nav.canales') },
  { path: 'preguntar', ...vacia('nav.preguntar') },
  { path: '**', redirectTo: 'tablero' },
];
