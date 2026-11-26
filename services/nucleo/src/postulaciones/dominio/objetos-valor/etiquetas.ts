import { normalizarEtiqueta } from '../../../compartido/dominio/etiquetas';
import { DatoInvalido } from '../errores';

export { normalizarEtiqueta };

export const MAX_ETIQUETAS = 20;
export const MAX_LARGO_ETIQUETA = 40;

/** Objeto de valor `Etiquetas`: lista sin repetidos, en el orden en que llegaron. */
export function crearEtiquetas(valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) throw new DatoInvalido('etiquetas', 'Las etiquetas van en una lista');
  const salida: string[] = [];
  for (const v of valor) {
    if (typeof v !== 'string') throw new DatoInvalido('etiquetas', 'Cada etiqueta es un texto');
    const e = normalizarEtiqueta(v);
    if (!e) continue;
    if (e.length > MAX_LARGO_ETIQUETA)
      throw new DatoInvalido(
        'etiquetas',
        `Una etiqueta admite hasta ${MAX_LARGO_ETIQUETA} caracteres: «${v}»`,
      );
    if (!salida.includes(e)) salida.push(e);
  }
  if (salida.length > MAX_ETIQUETAS)
    throw new DatoInvalido('etiquetas', `Una postulación admite hasta ${MAX_ETIQUETAS} etiquetas`);
  return salida;
}
