import type { DatosDeLaPropiedad } from './propiedad';
import { comunaNormalizada, direccionNormalizada, distanciaMetros } from './valores';

/** Hasta dónde dos pines son la misma propiedad (docs/diseno/arriendos.md §5.5). */
export const METROS_MISMA_PROPIEDAD = 30;

type Comparable = Pick<DatosDeLaPropiedad, 'direccion' | 'comuna' | 'dormitorios' | 'ubicacion'>;

/**
 * ¿Es probablemente la misma propiedad publicada en otro lado? Misma dirección (y comuna, si las dos la tienen),
 * o pines a menos de 30 m; en ambos casos, con los mismos dormitorios si los dos los dicen.
 */
export function esCandidata(a: Comparable, b: Comparable): boolean {
  if (a.dormitorios !== undefined && b.dormitorios !== undefined && a.dormitorios !== b.dormitorios)
    return false;
  if (a.direccion && b.direccion) {
    const misma = direccionNormalizada(a.direccion) === direccionNormalizada(b.direccion);
    const mismaComuna = !a.comuna || !b.comuna || comunaNormalizada(a.comuna) === comunaNormalizada(b.comuna);
    if (misma && mismaComuna) return true;
  }
  const precisa = (x: Comparable) => x.ubicacion && x.ubicacion.origen !== 'comuna';
  if (precisa(a) && precisa(b)) return distanciaMetros(a.ubicacion!, b.ubicacion!) <= METROS_MISMA_PROPIEDAD;
  return false;
}
