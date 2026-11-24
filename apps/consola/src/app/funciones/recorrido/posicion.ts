/** Dónde va el popup del recorrido respecto de su ancla. Función pura para poder probarla sin DOM. */

export interface Caja {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Tamano {
  width: number;
  height: number;
}

/** `dentro`: el ancla es tan grande que no cabe al lado; `centro`: no hay ancla. */
export type Lado = 'derecha' | 'abajo' | 'arriba' | 'izquierda' | 'dentro' | 'centro';

export interface Posicion {
  top: number;
  left: number;
  lado: Lado;
  /** Distancia de la flecha desde el borde superior (derecha e izquierda) o izquierdo (abajo y arriba). */
  flecha: number | null;
}

export const MARGEN = 12;
export const SEPARACION = 14;
const FLECHA_MIN = 18;

const limitar = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

export function calcularPosicion(ancla: Caja | null, popup: Tamano, vista: Tamano): Posicion {
  const centro = {
    top: limitar((vista.height - popup.height) / 2, MARGEN, vista.height - popup.height - MARGEN),
    left: limitar((vista.width - popup.width) / 2, MARGEN, vista.width - popup.width - MARGEN),
  };
  if (!ancla) return { ...centro, lado: 'centro', flecha: null };

  const derecha = ancla.left + ancla.width;
  const abajo = ancla.top + ancla.height;
  const medioY = ancla.top + ancla.height / 2;
  const medioX = ancla.left + ancla.width / 2;
  const topLado = limitar(medioY - popup.height / 2, MARGEN, vista.height - popup.height - MARGEN);
  const leftVertical = limitar(
    medioX - popup.width / 2,
    MARGEN,
    vista.width - popup.width - MARGEN,
  );
  const flechaY = limitar(medioY - topLado, FLECHA_MIN, popup.height - FLECHA_MIN);
  const flechaX = limitar(medioX - leftVertical, FLECHA_MIN, popup.width - FLECHA_MIN);

  if (derecha + SEPARACION + popup.width <= vista.width - MARGEN) {
    return { top: topLado, left: derecha + SEPARACION, lado: 'derecha', flecha: flechaY };
  }
  if (abajo + SEPARACION + popup.height <= vista.height - MARGEN) {
    return { top: abajo + SEPARACION, left: leftVertical, lado: 'abajo', flecha: flechaX };
  }
  if (ancla.top - SEPARACION - popup.height >= MARGEN) {
    return {
      top: ancla.top - SEPARACION - popup.height,
      left: leftVertical,
      lado: 'arriba',
      flecha: flechaX,
    };
  }
  if (ancla.left - SEPARACION - popup.width >= MARGEN) {
    return {
      top: topLado,
      left: ancla.left - SEPARACION - popup.width,
      lado: 'izquierda',
      flecha: flechaY,
    };
  }
  // Ancla grande: el popup va dentro de la parte visible, arriba y al centro.
  const visibleTop = Math.max(ancla.top, 0);
  return {
    top: limitar(visibleTop + 24, MARGEN, vista.height - popup.height - MARGEN),
    left: leftVertical,
    lado: 'dentro',
    flecha: null,
  };
}
