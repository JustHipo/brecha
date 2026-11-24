import { DatoInvalido } from '../errores';

export const MAX_ETIQUETAS = 20;
export const MAX_LARGO_ETIQUETA = 40;

/**
 * Una etiqueta se guarda normalizada (decisión P1 de csv.md): minúsculas, sin tildes y con espacios simples,
 * así «Investigación» e «investigacion» son la misma y el filtro no se parte en dos.
 */
export function normalizarEtiqueta(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

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
