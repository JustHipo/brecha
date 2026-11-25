/**
 * Lo que la página Perfil edita (docs/diseno/perfil.md §5), sin Angular para poder probarlo solo. Una regla se
 * edita como textos; al guardar se manda la lista entera con las prioridades según el orden de las blandas.
 */

export type FocoDePerfil = 'empleo' | 'arriendos';

/** Plataformas de empleo (las del contrato), para «sin modalidad cuenta como presencial». */
export const PLATAFORMAS = [
  'linkedin',
  'trabajando',
  'getonboard',
  'computrabajo',
  'chiletrabajos',
  'indeed',
  'sitio_empresa',
  'otra',
] as const;
export const MODALIDADES = ['presencial', 'hibrido', 'remoto'] as const;
export const ZONAS = ['valparaiso', 'santiago', 'otra'] as const;
export type Zona = (typeof ZONAS)[number];
export type ModalidadAceptada = (typeof MODALIDADES)[number];

/** Criterios de Arriendos según la forma de su valor (arriendos/dominio/busqueda.ts). */
export const SIN_VALOR = ['renta_exigida', 'aval'];
export const SI_NO = ['mascota', 'estacionamiento', 'amoblado'];
export const LISTA = ['comuna', 'tipo'];
export const FECHA = ['disponible_desde'];

/** El valor de un chequeo, en campos de formulario. */
export interface ValorEditable {
  /** Arriendos: monto, mínimo, lista separada por comas, fecha o «si»/«no». */
  texto: string;
  /** Empleo · titulo. */
  incluir: string;
  excluir: string;
  /** Empleo · modalidad_por_region. */
  zonas: Record<Zona, ModalidadAceptada[]>;
  noIndica: string[];
  /** Empleo · sueldo_publicado (vacío = tu renta pretendida). */
  minimo: string;
}

export interface ReglaEditable {
  /** Clave estable para la vista (las nuevas aún no tienen id). */
  clave: string;
  id?: string;
  texto: string;
  /** '' = sin chequeo: la aplica tu IA. */
  criterio: string;
  valor: ValorEditable;
  dura: boolean;
  etiquetas: string[];
}

export interface ReglaLeida {
  id: string;
  texto: string;
  criterio?: string;
  valor?: unknown;
  dura: boolean;
  prioridad?: number;
  etiquetas: string[];
}

export function valorVacio(): ValorEditable {
  return {
    texto: '',
    incluir: '',
    excluir: '',
    zonas: { valparaiso: [], santiago: [], otra: [] },
    noIndica: [],
    minimo: '',
  };
}

/** Normaliza como el núcleo (minúsculas, sin tildes, espacios simples). */
export function normalizarEtiqueta(t: string): string {
  return t
    .replace(/^#/, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function aValorEditable(criterio: string | undefined, v: unknown): ValorEditable {
  const e = valorVacio();
  if (!criterio || v === undefined || v === null) return e;
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (criterio === 'titulo') {
      e.incluir = ((o['incluir'] as string[]) ?? []).join(', ');
      e.excluir = ((o['excluir'] as string[]) ?? []).join(', ');
    } else if (criterio === 'modalidad_por_region') {
      for (const z of ZONAS) e.zonas[z] = [...((o[z] as ModalidadAceptada[]) ?? [])];
      e.noIndica = [...((o['noIndicaEsPresencialEn'] as string[]) ?? [])];
    } else if (criterio === 'sueldo_publicado') {
      e.minimo = o['minimo'] === undefined ? '' : String(o['minimo']);
    }
    return e;
  }
  e.texto = Array.isArray(v)
    ? v.join(', ')
    : typeof v === 'boolean'
      ? v
        ? 'si'
        : 'no'
      : String(v);
  return e;
}

let contador = 0;
export const claveNueva = () => `nueva-${++contador}`;

/** Duras primero y blandas por prioridad, como las manda el núcleo. */
export function aEditables(reglas: readonly ReglaLeida[]): ReglaEditable[] {
  const orden = [
    ...reglas.filter((r) => r.dura),
    ...reglas.filter((r) => !r.dura).sort((a, b) => (a.prioridad ?? 99) - (b.prioridad ?? 99)),
  ];
  return orden.map((r) => ({
    clave: r.id,
    id: r.id,
    texto: r.texto,
    criterio: r.criterio ?? '',
    valor: aValorEditable(r.criterio, r.valor),
    dura: r.dura,
    etiquetas: [...r.etiquetas],
  }));
}

const lista = (t: string) =>
  t
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const monto = (t: string) => Number(t.replace(/[.$\s]/g, '').replace(',', '.'));

function aValor(foco: FocoDePerfil, criterio: string, v: ValorEditable): unknown {
  if (foco === 'empleo') {
    if (criterio === 'titulo') return { incluir: lista(v.incluir), excluir: lista(v.excluir) };
    if (criterio === 'modalidad_por_region')
      return { ...v.zonas, noIndicaEsPresencialEn: v.noIndica };
    return v.minimo.trim() ? { minimo: monto(v.minimo) } : {};
  }
  if (SIN_VALOR.includes(criterio)) return undefined;
  if (SI_NO.includes(criterio)) return v.texto !== 'no';
  if (LISTA.includes(criterio)) return lista(v.texto);
  if (FECHA.includes(criterio)) return v.texto;
  return monto(v.texto);
}

/** Prioridad de cada blanda según su lugar entre las blandas (1, 2, 3…). */
export function prioridades(reglas: readonly ReglaEditable[]): Map<string, number> {
  return new Map(reglas.filter((r) => !r.dura).map((r, i) => [r.clave, i + 1]));
}

/** La lista entera para guardar (`reglas` del núcleo): los id se conservan. */
export function aEntradas(foco: FocoDePerfil, reglas: readonly ReglaEditable[]) {
  const p = prioridades(reglas);
  return reglas.map((r) => {
    const valor = r.criterio ? aValor(foco, r.criterio, r.valor) : undefined;
    return {
      ...(r.id ? { id: r.id } : {}),
      ...(r.texto.trim() ? { texto: r.texto.trim() } : {}),
      ...(r.criterio ? { criterio: r.criterio } : {}),
      ...(valor !== undefined ? { valor } : {}),
      dura: r.dura,
      ...(r.dura ? {} : { prioridad: p.get(r.clave) }),
      etiquetas: r.etiquetas,
    };
  });
}

/** Sube o baja una blanda entre las blandas; las duras no se mueven. */
export function moverBlanda(
  reglas: readonly ReglaEditable[],
  clave: string,
  paso: -1 | 1,
): ReglaEditable[] {
  const duras = reglas.filter((r) => r.dura);
  const blandas = reglas.filter((r) => !r.dura);
  const i = blandas.findIndex((r) => r.clave === clave);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= blandas.length) return [...reglas];
  [blandas[i], blandas[j]] = [blandas[j]!, blandas[i]!];
  return [...duras, ...blandas];
}

/** Al cambiar de dura a blanda queda última; de blanda a dura, después de las duras. */
export function fijarDura(
  reglas: readonly ReglaEditable[],
  clave: string,
  dura: boolean,
): ReglaEditable[] {
  const r = reglas.find((x) => x.clave === clave);
  if (!r || r.dura === dura) return [...reglas];
  const resto = reglas.filter((x) => x.clave !== clave);
  const nueva = { ...r, dura };
  return [
    ...resto.filter((x) => x.dura),
    ...(dura ? [nueva] : []),
    ...resto.filter((x) => !x.dura),
    ...(dura ? [] : [nueva]),
  ];
}

export interface Grupo {
  etiqueta: string | null;
  reglas: ReglaEditable[];
}

/** Agrupa por la primera etiqueta (en orden alfabético) y deja al final las sin etiqueta; con filtro, solo esas. */
export function agrupar(reglas: readonly ReglaEditable[], filtro: string | null): Grupo[] {
  if (filtro)
    return [{ etiqueta: filtro, reglas: reglas.filter((r) => r.etiquetas.includes(filtro)) }];
  const grupos = new Map<string | null, ReglaEditable[]>();
  for (const r of reglas) {
    const e = r.etiquetas[0] ?? null;
    grupos.set(e, [...(grupos.get(e) ?? []), r]);
  }
  return [...grupos]
    .map(([etiqueta, rs]) => ({ etiqueta, reglas: rs }))
    .sort((a, b) =>
      a.etiqueta === null ? 1 : b.etiqueta === null ? -1 : a.etiqueta.localeCompare(b.etiqueta),
    );
}

/** Etiquetas en uso con cuántas reglas tiene cada una, de la más usada a la menos. */
export function etiquetasEnUso(
  reglas: readonly ReglaEditable[],
): { etiqueta: string; total: number }[] {
  const c = new Map<string, number>();
  for (const r of reglas) for (const e of r.etiquetas) c.set(e, (c.get(e) ?? 0) + 1);
  return [...c]
    .map(([etiqueta, total]) => ({ etiqueta, total }))
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta));
}
