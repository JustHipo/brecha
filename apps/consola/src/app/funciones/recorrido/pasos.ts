/**
 * Pasos del recorrido guiado. Cada paso apunta a un elemento con `data-tutorial="<ancla>"`:
 * se prueba cada ancla en orden y, si ninguna aparece, el popup sale al centro de la ventana.
 * `ruta` es la pantalla donde vive el ancla; si no se está ahí, el recorrido navega antes de mostrarlo.
 * Los textos están en `recorrido.pasos.<id>.titulo` y `.texto` de los archivos de idioma.
 */
export interface Paso {
  readonly id: string;
  readonly anclas: readonly string[];
  readonly ruta?: string;
}

export const PASOS: readonly Paso[] = [
  { id: 'bienvenida', anclas: ['marca'], ruta: '/tablero' },
  { id: 'tablero', anclas: ['tablero'], ruta: '/tablero' },
  { id: 'nueva', anclas: ['nueva'], ruta: '/tablero' },
  // Sin postulaciones todavía no hay tarjetas: se señala el tablero vacío.
  { id: 'ficha', anclas: ['ficha', 'tablero'], ruta: '/tablero' },
  { id: 'bandeja', anclas: ['bandeja'] },
  { id: 'red', anclas: ['red'] },
  { id: 'ajustes', anclas: ['ajustes'] },
  // La importación por CSV llega en otra rama: su botón debe llevar data-tutorial="importar".
  // Hoy el ancla existe en el tablero vacío («Importar fichas»); si no está, el paso sale al centro.
  { id: 'importar', anclas: ['importar'], ruta: '/tablero' },
];
