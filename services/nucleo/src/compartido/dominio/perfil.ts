import { ErrorDeDominio } from './error-de-dominio';
import { normalizarEtiqueta } from './etiquetas';
import type { Deps } from './puertos';

/**
 * El perfil de búsqueda (docs/diseno/perfil.md §3.1): reglas duras y blandas con prioridad, etiquetas libres e
 * historial con motivo. La forma es la misma en Empleo y en Arriendos; cada foco trae su catálogo de criterios
 * (lo que el código sabe revisar) y guarda su perfil en su propia tabla (PB-D10).
 */

export class ReglaInvalida extends ErrorDeDominio {
  readonly codigo = 'VALIDACION';
  constructor(campo: string, mensaje: string) {
    super(mensaje, campo);
  }
}

export class ReglaNoEncontrada extends ErrorDeDominio {
  readonly codigo = 'NO_ENCONTRADO';
  constructor(id: string) {
    super(`No hay una regla con id ${id} (mira los id con ver_perfil)`, 'id');
  }
}

export interface Regla<C extends string = string> {
  readonly id: string;
  /** En palabras de la persona. Si la regla tiene criterio y no se escribió texto, se describe sola. */
  readonly texto: string;
  /** Chequeo que el código revisa; sin él, la regla la aplica tu IA leyéndola. */
  readonly criterio?: C;
  /** El valor del chequeo; cada foco lo valida. */
  readonly valor?: unknown;
  readonly dura: boolean;
  /** Solo las blandas: 1 es la más importante, siempre seguidas (1, 2, 3…). */
  readonly prioridad?: number;
  /** Minúsculas y sin tildes (PB-D14). */
  readonly etiquetas: readonly string[];
}

export interface CambioDePerfil {
  readonly ocurridoEn: Date;
  readonly origen: string;
  readonly motivo: string;
  /** Las reglas como quedaron, en una línea cada una. */
  readonly resumen: string[];
}

/** Lo que cada foco sabe revisar por código. */
export interface Catalogo<C extends string> {
  readonly criterios: readonly C[];
  /** Valida y normaliza el valor del criterio; lanza `ReglaInvalida`. */
  valor(criterio: C, valor: unknown): unknown;
  /** El valor en palabras, sin «Dura ·»: «Arriendo más gastos comunes hasta $650.000». */
  describir(criterio: C, valor: unknown): string;
}

export const MAX_REGLAS = 60;
export const MAX_TEXTO_REGLA = 500;
export const MAX_ETIQUETAS_POR_REGLA = 10;
export const MAX_LARGO_ETIQUETA_REGLA = 40;
export const MAX_HISTORIAL = 200;

/** Lo que llega desde REST, MCP o la consola para una regla. */
export interface EntradaRegla {
  id?: unknown;
  texto?: unknown;
  criterio?: unknown;
  valor?: unknown;
  dura?: unknown;
  prioridad?: unknown;
  etiquetas?: unknown;
}

/**
 * Los cambios a las reglas (PB-D12). Se aplican en este orden: `reglas` (reemplaza la lista entera; las que traen
 * id lo conservan), `quitar`, `cambiar`, `agregar` y `ordenar`.
 */
export interface EntradaCambios {
  reglas?: unknown;
  agregar?: unknown;
  cambiar?: unknown;
  quitar?: unknown;
  ordenar?: unknown;
}

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function hayCambiosDeReglas(e: EntradaCambios): boolean {
  return [e.reglas, e.agregar, e.cambiar, e.quitar, e.ordenar].some((x) => x !== undefined && x !== null);
}

export function etiquetasDeRegla(valor: unknown): string[] {
  if (vacio(valor)) return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  const salida: string[] = [];
  for (const v of lista) {
    if (typeof v !== 'string') throw new ReglaInvalida('etiquetas', 'Cada etiqueta es un texto');
    const e = normalizarEtiqueta(v.replace(/^#/, ''));
    if (!e) continue;
    if (e.length > MAX_LARGO_ETIQUETA_REGLA)
      throw new ReglaInvalida(
        'etiquetas',
        `Una etiqueta admite hasta ${MAX_LARGO_ETIQUETA_REGLA} caracteres`,
      );
    if (!salida.includes(e)) salida.push(e);
  }
  if (salida.length > MAX_ETIQUETAS_POR_REGLA)
    throw new ReglaInvalida('etiquetas', `Una regla admite hasta ${MAX_ETIQUETAS_POR_REGLA} etiquetas`);
  return salida;
}

function siNo(campo: string, v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  if (v === 'si' || v === 'sí' || v === 'true') return true;
  if (v === 'no' || v === 'false') return false;
  throw new ReglaInvalida(campo, `${campo} es sí o no`);
}

function prioridadDe(v: unknown): number | undefined {
  if (vacio(v)) return undefined;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_REGLAS)
    throw new ReglaInvalida('prioridad', `La prioridad es un entero de 1 a ${MAX_REGLAS}`);
  return n;
}

function textoDe(v: unknown): string | undefined {
  if (vacio(v)) return undefined;
  if (typeof v !== 'string') throw new ReglaInvalida('texto', 'El texto de la regla es un texto');
  const t = v.trim().replace(/\s+/g, ' ');
  if (t.length > MAX_TEXTO_REGLA)
    throw new ReglaInvalida('texto', `Una regla admite hasta ${MAX_TEXTO_REGLA} caracteres`);
  return t;
}

/** Arma una regla completa y válida. `prioridad` queda como vino: el orden final lo pone `ordenarBlandas`. */
function reglaDesde<C extends string>(e: EntradaRegla, id: string, cat: Catalogo<C>): Regla<C> {
  let criterio: C | undefined;
  let valor: unknown;
  if (!vacio(e.criterio)) {
    if (typeof e.criterio !== 'string' || !(cat.criterios as readonly string[]).includes(e.criterio))
      throw new ReglaInvalida(
        'criterio',
        `Criterio desconocido: ${String(e.criterio)}. Los que se revisan por código son: ${cat.criterios.join(', ')}. Para otra cosa, escribe la regla como texto sin criterio`,
      );
    criterio = e.criterio as C;
    valor = cat.valor(criterio, e.valor);
  }
  const texto = textoDe(e.texto) ?? (criterio ? cat.describir(criterio, valor) : undefined);
  if (!texto) throw new ReglaInvalida('texto', 'Escribe la regla (o elige un criterio)');
  const dura = siNo('dura', e.dura) ?? true;
  const prioridad = dura ? undefined : prioridadDe(e.prioridad);
  return {
    id,
    texto,
    ...(criterio ? { criterio } : {}),
    ...(valor !== undefined ? { valor } : {}),
    dura,
    ...(prioridad ? { prioridad } : {}),
    etiquetas: etiquetasDeRegla(e.etiquetas),
  };
}

/**
 * Una regla guardada antes del perfil (Arriendos guardaba solo criterio, valor, dura y prioridad): recibe su
 * descripción como texto y etiquetas vacías (PB-D11). Una regla ya completa queda igual.
 */
export function reglaGuardada<C extends string>(
  r: Partial<Regla<C>> & { id: string },
  cat: Catalogo<C>,
): Regla<C> {
  const texto =
    r.texto && r.texto.trim()
      ? r.texto
      : r.criterio
        ? cat.describir(r.criterio, r.valor)
        : '(regla sin texto)';
  return {
    id: r.id,
    texto,
    ...(r.criterio ? { criterio: r.criterio } : {}),
    ...(r.valor !== undefined ? { valor: r.valor } : {}),
    dura: r.dura ?? true,
    ...(!r.dura && r.prioridad ? { prioridad: r.prioridad } : {}),
    etiquetas: [...(r.etiquetas ?? [])],
  };
}

interface ConClave<C extends string> {
  regla: Regla<C>;
  clave: number;
}

/** Las blandas quedan con prioridades seguidas (1, 2, 3…) según su clave; empates por el orden de la lista. */
function ordenarBlandas<C extends string>(lista: ConClave<C>[]): Regla<C>[] {
  const blandas = lista
    .map((x, i) => ({ ...x, i }))
    .filter((x) => !x.regla.dura)
    .sort((a, b) => a.clave - b.clave || a.i - b.i);
  const nuevas = lista.map((x) => x.regla);
  blandas.forEach((x, n) => {
    nuevas[x.i] = { ...x.regla, prioridad: n + 1 };
  });
  // Duras primero, en su orden; después las blandas por prioridad.
  return [
    ...nuevas.filter((r) => r.dura),
    ...nuevas.filter((r) => !r.dura).sort((a, b) => a.prioridad! - b.prioridad!),
  ];
}

function lista(campo: string, v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ReglaInvalida(campo, `${campo} va en una lista`);
  return v;
}

function idDe(campo: string, v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new ReglaInvalida(campo, 'Falta el id de la regla');
  return v.trim();
}

/**
 * Aplica los cambios y devuelve la lista nueva, sin tocar la de entrada. Una blanda que se agrega o se mueve a la
 * prioridad N queda en N y corre las demás.
 */
export function aplicarCambios<C extends string>(
  actuales: readonly Regla<C>[],
  e: EntradaCambios,
  cat: Catalogo<C>,
  deps: Pick<Deps, 'ids'>,
): Regla<C>[] {
  let trabajo: ConClave<C>[] = actuales.map((r) => ({ regla: r, clave: r.prioridad ?? Infinity }));

  if (e.reglas !== undefined && e.reglas !== null) {
    const ids = new Set(actuales.map((r) => r.id));
    trabajo = lista('reglas', e.reglas).map((x) => {
      const ent = (x ?? {}) as EntradaRegla;
      const id = typeof ent.id === 'string' && ids.has(ent.id) ? ent.id : deps.ids.nuevo();
      ids.delete(id);
      const regla = reglaDesde(ent, id, cat);
      return { regla, clave: regla.prioridad ?? Infinity };
    });
  }

  for (const x of lista('quitar', e.quitar)) {
    const id = idDe('quitar', x);
    if (!trabajo.some((t) => t.regla.id === id)) throw new ReglaNoEncontrada(id);
    trabajo = trabajo.filter((t) => t.regla.id !== id);
  }

  for (const x of lista('cambiar', e.cambiar)) {
    const ent = (x ?? {}) as EntradaRegla;
    const id = idDe('cambiar.id', ent.id);
    const i = trabajo.findIndex((t) => t.regla.id === id);
    if (i < 0) throw new ReglaNoEncontrada(id);
    const vieja = trabajo[i]!.regla;
    const tocaCriterio = 'criterio' in ent || 'valor' in ent;
    const criterio = 'criterio' in ent ? ent.criterio : vieja.criterio;
    const valor = 'valor' in ent ? ent.valor : vieja.valor;
    // Si el texto era la descripción automática y cambia el valor, se vuelve a describir.
    const textoAutomatico = vieja.criterio && vieja.texto === cat.describir(vieja.criterio, vieja.valor);
    const texto = 'texto' in ent ? ent.texto : tocaCriterio && textoAutomatico ? undefined : vieja.texto;
    const regla = reglaDesde(
      {
        texto,
        criterio,
        valor,
        dura: 'dura' in ent ? ent.dura : vieja.dura,
        prioridad: 'prioridad' in ent ? ent.prioridad : vieja.prioridad,
        etiquetas: 'etiquetas' in ent ? ent.etiquetas : vieja.etiquetas,
      },
      id,
      cat,
    );
    // La clave ubica la regla entre las blandas: pedir P2 la deja en 2 y corre a las demás.
    const antes = vieja.dura ? Infinity : (vieja.prioridad ?? Infinity);
    const pedida = 'prioridad' in ent ? regla.prioridad : undefined;
    const clave =
      regla.dura || pedida === undefined
        ? antes // de dura a blanda sin prioridad: al final
        : pedida < antes
          ? pedida - 0.5
          : pedida > antes
            ? pedida + 0.5
            : pedida;
    trabajo[i] = { regla, clave };
  }

  for (const x of lista('agregar', e.agregar)) {
    const regla = reglaDesde((x ?? {}) as EntradaRegla, deps.ids.nuevo(), cat);
    trabajo.push({ regla, clave: regla.prioridad !== undefined ? regla.prioridad - 0.5 : Infinity });
  }

  let reglas = ordenarBlandas(trabajo);

  const orden = lista('ordenar', e.ordenar).map((x) => idDe('ordenar', x));
  if (orden.length) {
    for (const id of orden) {
      const r = reglas.find((y) => y.id === id);
      if (!r) throw new ReglaNoEncontrada(id);
      if (r.dura)
        throw new ReglaInvalida('ordenar', `La regla ${id} es dura: solo las blandas tienen prioridad`);
    }
    const blandas = reglas.filter((r) => !r.dura);
    const nuevas = [
      ...orden.map((id) => blandas.find((r) => r.id === id)!),
      ...blandas.filter((r) => !orden.includes(r.id)),
    ];
    reglas = ordenarBlandas([
      ...reglas.filter((r) => r.dura).map((r) => ({ regla: r, clave: Infinity })),
      ...nuevas.map((r, n) => ({ regla: r, clave: n + 1 })),
    ]);
  }

  if (reglas.length > MAX_REGLAS) throw new ReglaInvalida('reglas', `Hasta ${MAX_REGLAS} reglas`);
  return reglas;
}

/** «Dura · Santiago solo híbrido o remoto #ubicacion #santiago», «P1 · Ojalá con sueldo publicado». */
export function describirRegla(r: Pick<Regla, 'dura' | 'prioridad' | 'texto' | 'etiquetas'>): string {
  const quien = r.dura ? 'Dura' : `P${r.prioridad ?? 1}`;
  const etiquetas = r.etiquetas.length
    ? ` ${r.etiquetas.map((e) => `#${e.replace(/ /g, '-')}`).join(' ')}`
    : '';
  return `${quien} · ${r.texto}${etiquetas}`;
}

/** Suma una entrada al historial (las más viejas se van pasadas las 200). */
export function anotarCambio(
  historial: readonly CambioDePerfil[],
  reglas: readonly Regla[],
  e: { motivo: unknown; origen: string },
  ahora: Date,
): CambioDePerfil[] {
  const motivo = textoDe(e.motivo);
  if (!motivo)
    throw new ReglaInvalida('motivo', 'Falta el motivo: di por qué cambia el perfil (queda en el historial)');
  const nuevo = [
    ...historial,
    { ocurridoEn: ahora, origen: e.origen, motivo, resumen: reglas.map(describirRegla) },
  ];
  return nuevo.length > MAX_HISTORIAL ? nuevo.slice(-MAX_HISTORIAL) : nuevo;
}

/** Etiquetas en uso en el perfil, de la más usada a la menos (para el filtro de la consola). */
export function etiquetasEnUso(reglas: readonly Regla[]): { etiqueta: string; total: number }[] {
  const cuenta = new Map<string, number>();
  for (const r of reglas) for (const e of r.etiquetas) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
  return [...cuenta]
    .map(([etiqueta, total]) => ({ etiqueta, total }))
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta));
}
