/**
 * Número del aviso en la URL de un portal (docs/diseno/pasos.md §5.1): Chiletrabajos `…-ia-3916453`,
 * Teamtailor `/jobs/8632917-ai-engineer`, LinkedIn `/jobs/view/4012345678`. Es el último grupo de 6 o más
 * dígitos de la ruta (no de la consulta). También acepta el número solo (`3916453` o `#3916453`).
 */
export function idDeAviso(texto: string): string | null {
  const t = texto.trim().replace(/^#/, '');
  if (/^\d{6,}$/.test(t)) return t;
  let ruta: string;
  try {
    ruta = new URL(t).pathname;
  } catch {
    return null;
  }
  const grupos = ruta.match(/\d{6,}/g);
  return grupos ? grupos[grupos.length - 1]! : null;
}
