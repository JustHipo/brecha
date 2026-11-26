/**
 * Una etiqueta se guarda normalizada (decisión P1 de csv.md, PB-D14 de perfil.md): minúsculas, sin tildes y con
 * espacios simples, así «Investigación» e «investigacion» son la misma y el filtro no se parte en dos.
 */
export function normalizarEtiqueta(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
