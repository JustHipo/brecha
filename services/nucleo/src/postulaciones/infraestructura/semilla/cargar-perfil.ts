/**
 * Carga un perfil de búsqueda de Empleo desde un archivo JSON (docs/diseno/perfil.md §6) contra el núcleo que esté
 * corriendo, por REST y con el token de servicio (queda con origen `importacion`). Reemplaza las reglas por las del
 * archivo; si ya están iguales, no hace nada, así que cargarla dos veces deja lo mismo.
 */

export interface SemillaDePerfil {
  reglas: Record<string, unknown>[];
  datos?: Record<string, unknown>;
  motivo?: string;
}

interface ReglaLeida {
  texto: string;
  criterio?: string;
  valor?: unknown;
  dura: boolean;
  prioridad?: number;
  etiquetas: string[];
}

interface PerfilLeido {
  reglas: ReglaLeida[];
  datos: Record<string, unknown>;
}

export interface Conexion {
  url: string;
  token: string;
  fetch?: typeof fetch;
}

export type ResultadoDeCarga = { accion: 'igual' } | { accion: 'cargado'; reglas: string[] };

/** JSON estable (claves ordenadas) para comparar sin que importe el orden de las propiedades. */
function estable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${estable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

const forma = (r: ReglaLeida) => ({
  texto: r.texto,
  criterio: r.criterio,
  valor: r.valor,
  dura: r.dura,
  prioridad: r.dura ? undefined : r.prioridad,
  etiquetas: r.etiquetas,
});

export function validarSemilla(x: unknown): SemillaDePerfil {
  if (!x || typeof x !== 'object' || !Array.isArray((x as SemillaDePerfil).reglas))
    throw new Error('El archivo debe tener { "reglas": [...], "datos": {...}, "motivo": "..." }');
  return x as SemillaDePerfil;
}

export async function cargarPerfil(semilla: SemillaDePerfil, c: Conexion): Promise<ResultadoDeCarga> {
  const f = c.fetch ?? fetch;
  const pedir = async (metodo: 'GET' | 'PUT', cuerpo?: unknown): Promise<PerfilLeido> => {
    const r = await f(`${c.url.replace(/\/$/, '')}/api/v1/perfil`, {
      method: metodo,
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    });
    const datos = (await r.json()) as unknown;
    if (!r.ok) throw new Error(`El núcleo respondió ${r.status}: ${JSON.stringify(datos)}`);
    return datos as PerfilLeido;
  };

  const actual = await pedir('GET');
  // Lo que quedaría: se carga en seco comparando con lo que el núcleo normaliza (etiquetas, textos automáticos).
  const cuerpo = {
    reglas: semilla.reglas,
    ...(semilla.datos ? { datos: semilla.datos } : {}),
    motivo: semilla.motivo ?? 'Perfil cargado desde archivo',
  };
  const mismasReglas =
    actual.reglas.length === semilla.reglas.length &&
    estable(actual.reglas.map(forma)) === estable(normalizadas(semilla.reglas));
  const mismosDatos = !semilla.datos || estable(sinNulos(semilla.datos)) === estable(actual.datos);
  if (mismasReglas && mismosDatos) return { accion: 'igual' };
  const nuevo = await pedir('PUT', cuerpo);
  return {
    accion: 'cargado',
    reglas: nuevo.reglas.map((r) => (r as unknown as { descripcion: string }).descripcion),
  };
}

function sinNulos(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== ''));
}

/**
 * Las reglas del archivo como las devolvería el núcleo, para comparar: duras primero y blandas por prioridad,
 * etiquetas normalizadas. Si el archivo no trae texto en una regla con criterio, no se puede saber el texto
 * automático: la comparación falla y se vuelve a cargar (no hace daño).
 */
function normalizadas(reglas: Record<string, unknown>[]) {
  const etiqueta = (t: string) =>
    t.replace(/^#/, '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const rs = reglas.map((r, i) => ({
    i,
    texto: typeof r['texto'] === 'string' ? r['texto'].trim().replace(/\s+/g, ' ') : undefined,
    criterio: r['criterio'] as string | undefined,
    valor: r['valor'],
    dura: r['dura'] !== false,
    prioridad: r['prioridad'] as number | undefined,
    etiquetas: [...new Set(((r['etiquetas'] as string[]) ?? []).map(etiqueta).filter(Boolean))],
  }));
  const blandas = rs
    .filter((r) => !r.dura)
    .sort((a, b) => (a.prioridad ?? Infinity) - (b.prioridad ?? Infinity) || a.i - b.i)
    .map((r, n) => ({ ...r, prioridad: n + 1 }));
  return [...rs.filter((r) => r.dura), ...blandas].map(({ i: _i, ...r }) => ({
    ...r,
    prioridad: r.dura ? undefined : r.prioridad,
  }));
}
