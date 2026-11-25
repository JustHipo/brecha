import {
  anotarCambio,
  aplicarCambios,
  hayCambiosDeReglas,
  reglaGuardada,
  ReglaInvalida,
  type CambioDePerfil,
  type Catalogo,
  type EntradaCambios,
  type Regla,
} from '../../compartido/dominio/perfil';
import { esFecha, type Deps, type Fecha } from '../../compartido/dominio/puertos';
import { MODALIDADES, PLATAFORMAS, type Modalidad, type Plataforma } from './objetos-valor/valores';

/**
 * El perfil de búsqueda de Empleo (docs/diseno/perfil.md §3.3): la regla común con tres chequeos que el código sabe
 * revisar sobre el aviso de cada postulación. Lo demás (contratos cortos, liderazgo con años) lo aplica tu IA
 * leyendo el texto de la regla. Un choque nunca cambia el estado de una postulación (PB-D4).
 */

export const CRITERIOS_EMPLEO = ['titulo', 'modalidad_por_region', 'sueldo_publicado'] as const;
export type CriterioEmpleo = (typeof CRITERIOS_EMPLEO)[number];

export const ZONAS = ['valparaiso', 'santiago', 'otra'] as const;
export type Zona = (typeof ZONAS)[number];

export interface ValorTitulo {
  /** Si el título trae una de estas, cumple aunque traiga una excluida («Frontend / Backend»). */
  incluir: string[];
  excluir: string[];
}

export interface ValorModalidad {
  valparaiso: Modalidad[];
  santiago: Modalidad[];
  otra: Modalidad[];
  /** En estas plataformas, un aviso sin modalidad cuenta como presencial (trabajando.cl, «Jornada Completa»). */
  noIndicaEsPresencialEn: Plataforma[];
}

export interface ValorSueldo {
  /** Sin mínimo, se compara con tu renta pretendida. */
  minimo?: number;
}

export type ReglaEmpleo = Regla<CriterioEmpleo>;

/** Datos tuyos que no descartan: tu IA los usa al llenar formularios (PB-D8). */
export interface DatosDeLaPersona {
  rentaPretendida?: number;
  disponibleDesde?: Fecha;
  notas?: string;
}

export interface DatosPerfilEmpleo {
  reglas: ReglaEmpleo[];
  datos: DatosDeLaPersona;
  historial: CambioDePerfil[];
  actualizadaEn: Date | null;
}

const MODALIDAD_EN_TEXTO: Record<Modalidad, string> = {
  remoto: 'remoto',
  hibrido: 'híbrido',
  presencial: 'presencial',
  no_indica: 'sin modalidad',
};
const ZONA_EN_TEXTO: Record<Zona, string> = {
  valparaiso: 'Región de Valparaíso',
  santiago: 'Santiago',
  otra: 'otro lugar',
};

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const vacio = (v: unknown) => v === undefined || v === null || v === '';

function listaDeTextos(campo: string, v: unknown, max = 30): string[] {
  const lista = Array.isArray(v) ? v : vacio(v) ? [] : String(v).split(',');
  const salida: string[] = [];
  for (const x of lista) {
    if (typeof x !== 'string') throw new ReglaInvalida(campo, `${campo} es una lista de textos`);
    const t = x.trim();
    if (!t) continue;
    if (t.length > 60) throw new ReglaInvalida(campo, `Cada palabra de ${campo} admite hasta 60 caracteres`);
    if (!salida.some((y) => normal(y) === normal(t))) salida.push(t);
  }
  if (salida.length > max) throw new ReglaInvalida(campo, `${campo} admite hasta ${max}`);
  return salida;
}

function listaDe<T extends string>(campo: string, lista: readonly T[], v: unknown): T[] {
  const xs = Array.isArray(v) ? v : vacio(v) ? [] : [v];
  const salida: T[] = [];
  for (const x of xs) {
    if (!lista.includes(x as T))
      throw new ReglaInvalida(campo, `${String(x)} no es una de: ${lista.join(', ')}`);
    if (!salida.includes(x as T)) salida.push(x as T);
  }
  return salida;
}

function objeto(campo: string, v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new ReglaInvalida(campo, `${campo} va como objeto (mira los criterios con ver_perfil)`);
  return v as Record<string, unknown>;
}

function valorValido(c: CriterioEmpleo, v: unknown): unknown {
  switch (c) {
    case 'titulo': {
      const o = objeto('valor (titulo)', v);
      const incluir = listaDeTextos('incluir', o['incluir']);
      const excluir = listaDeTextos('excluir', o['excluir']);
      if (!incluir.length && !excluir.length)
        throw new ReglaInvalida('valor (titulo)', 'Pon al menos una palabra para incluir o excluir');
      return { incluir, excluir } satisfies ValorTitulo;
    }
    case 'modalidad_por_region': {
      const o = objeto('valor (modalidad_por_region)', v);
      const sin = MODALIDADES.filter((m) => m !== 'no_indica');
      return {
        valparaiso: listaDe('valparaiso', sin, o['valparaiso']),
        santiago: listaDe('santiago', sin, o['santiago']),
        otra: listaDe('otra', sin, o['otra']),
        noIndicaEsPresencialEn: listaDe('noIndicaEsPresencialEn', PLATAFORMAS, o['noIndicaEsPresencialEn']),
      } satisfies ValorModalidad;
    }
    case 'sueldo_publicado': {
      const o = vacio(v) ? {} : objeto('valor (sueldo_publicado)', v);
      const m = o['minimo'];
      if (vacio(m)) return {};
      if (typeof m !== 'number' || !Number.isFinite(m) || m < 0 || m > 1e10)
        throw new ReglaInvalida('valor (sueldo_publicado)', 'El mínimo es un monto en pesos');
      return { minimo: Math.round(m) } satisfies ValorSueldo;
    }
  }
}

function modalidades(xs: readonly Modalidad[]): string {
  return xs.length ? xs.map((m) => MODALIDAD_EN_TEXTO[m]).join(', ') : 'nada';
}

export function describirValor(c: CriterioEmpleo, v: unknown): string {
  switch (c) {
    case 'titulo': {
      const t = v as ValorTitulo;
      const partes = [
        t.incluir.length ? `el título dice ${t.incluir.join(' o ')}` : '',
        t.excluir.length ? `no ${t.excluir.join(', ')}` : '',
      ].filter(Boolean);
      return partes.join('; ').replace(/^./, (x) => x.toUpperCase());
    }
    case 'modalidad_por_region': {
      const m = v as ValorModalidad;
      const zonas = ZONAS.map((z) => `${ZONA_EN_TEXTO[z]}: ${modalidades(m[z])}`).join('. ');
      return `${zonas}${m.noIndicaEsPresencialEn.length ? `. Sin modalidad en ${m.noIndicaEsPresencialEn.join(', ')} cuenta como presencial` : ''}`;
    }
    case 'sueldo_publicado': {
      const s = v as ValorSueldo;
      return s.minimo
        ? `Con sueldo publicado de ${pesos(s.minimo)} o más`
        : 'Con sueldo publicado que llegue a tu renta pretendida';
    }
  }
}

export const CATALOGO_EMPLEO: Catalogo<CriterioEmpleo> = {
  criterios: CRITERIOS_EMPLEO,
  valor: (c, v) => valorValido(c, v),
  describir: (c, v) => describirValor(c, v),
};

export interface EntradaPerfilEmpleo extends EntradaCambios {
  datos?: Partial<Record<keyof DatosDeLaPersona, unknown>> | null;
  motivo: unknown;
}

export function perfilVacio(): DatosPerfilEmpleo {
  return { reglas: [], datos: {}, historial: [], actualizadaEn: null };
}

export class PerfilEmpleo {
  private constructor(private d: DatosPerfilEmpleo) {}

  static reconstituir(d: DatosPerfilEmpleo): PerfilEmpleo {
    const copia = structuredClone(d);
    copia.reglas = copia.reglas.map((r) => reglaGuardada(r, CATALOGO_EMPLEO));
    return new PerfilEmpleo(copia);
  }

  datos(): DatosPerfilEmpleo {
    return structuredClone(this.d);
  }

  /** Cambia reglas y datos; siempre con motivo, que queda en el historial (PB-D2). */
  cambiar(e: EntradaPerfilEmpleo, origen: string, deps: Deps): void {
    const reglas = hayCambiosDeReglas(e)
      ? aplicarCambios(this.d.reglas, e, CATALOGO_EMPLEO, deps)
      : this.d.reglas;
    const datos: Record<string, unknown> = { ...this.d.datos };
    if (e.datos) {
      const p = e.datos;
      const fijar = (k: keyof DatosDeLaPersona, v: unknown) => {
        if (v === undefined) Reflect.deleteProperty(datos, k);
        else datos[k] = v;
      };
      if ('rentaPretendida' in p) {
        const v = p.rentaPretendida;
        if (!vacio(v) && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e10))
          throw new ReglaInvalida('datos.rentaPretendida', 'La renta pretendida es un monto en pesos');
        fijar('rentaPretendida', vacio(v) ? undefined : Math.round(v as number));
      }
      if ('disponibleDesde' in p) {
        const v = p.disponibleDesde;
        if (!vacio(v) && (typeof v !== 'string' || !esFecha(v)))
          throw new ReglaInvalida('datos.disponibleDesde', 'La fecha va como AAAA-MM-DD');
        fijar('disponibleDesde', vacio(v) ? undefined : v);
      }
      if ('notas' in p) {
        const v = p.notas;
        if (!vacio(v) && (typeof v !== 'string' || v.length > 2000))
          throw new ReglaInvalida('datos.notas', 'Las notas son un texto de hasta 2000 caracteres');
        fijar('notas', vacio(v) ? undefined : (v as string).trim());
      }
    }
    const ahora = deps.reloj.ahora();
    this.d.historial = anotarCambio(this.d.historial, reglas, { motivo: e.motivo, origen }, ahora);
    this.d.reglas = reglas;
    this.d.datos = datos as DatosDeLaPersona;
    this.d.actualizadaEn = ahora;
  }
}

// ── Revisar una postulación contra el perfil ──

/** Texto en minúsculas, sin tildes y con espacios simples entre palabras y números. */
function normal(t: string): string {
  return t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Trae la palabra o frase entera, o pegada («fullstack» calza con «full stack»). */
function trae(texto: string, termino: string): boolean {
  const t = normal(termino);
  if (!t) return false;
  return ` ${texto} `.includes(` ${t} `) || texto.replace(/ /g, '').includes(t.replace(/ /g, ''));
}

const COMUNAS_VALPARAISO = [
  'region de valparaiso',
  'v region',
  'quinta region',
  'valparaiso',
  'vina del mar',
  'vina',
  'concon',
  'quilpue',
  'villa alemana',
  'casablanca',
  'juan fernandez',
  'puchuncavi',
  'quintero',
  'isla de pascua',
  'los andes',
  'calle larga',
  'rinconada',
  'san esteban',
  'la ligua',
  'cabildo',
  'papudo',
  'petorca',
  'zapallar',
  'quillota',
  'la calera',
  'hijuelas',
  'la cruz',
  'nogales',
  'san antonio',
  'algarrobo',
  'cartagena',
  'el quisco',
  'el tabo',
  'santo domingo',
  'san felipe',
  'catemu',
  'llaillay',
  'llay llay',
  'panquehue',
  'putaendo',
  'santa maria',
  'limache',
  'olmue',
  'marga marga',
  'gran valparaiso',
];

const COMUNAS_SANTIAGO = [
  'santiago',
  'region metropolitana',
  'metropolitana',
  'rm',
  'cerrillos',
  'cerro navia',
  'conchali',
  'el bosque',
  'estacion central',
  'huechuraba',
  'independencia',
  'la cisterna',
  'la florida',
  'la granja',
  'la pintana',
  'la reina',
  'las condes',
  'lo barnechea',
  'lo espejo',
  'lo prado',
  'macul',
  'maipu',
  'nunoa',
  'pedro aguirre cerda',
  'penalolen',
  'providencia',
  'pudahuel',
  'quilicura',
  'quinta normal',
  'recoleta',
  'renca',
  'san joaquin',
  'san miguel',
  'san ramon',
  'vitacura',
  'puente alto',
  'pirque',
  'san jose de maipo',
  'colina',
  'lampa',
  'tiltil',
  'san bernardo',
  'buin',
  'calera de tango',
  'paine',
  'melipilla',
  'alhue',
  'curacavi',
  'maria pinto',
  'san pedro',
  'talagante',
  'el monte',
  'isla de maipo',
  'padre hurtado',
  'penaflor',
  'ciudad empresarial',
  'santiago centro',
];

/** Otras regiones o países: ahí la regla de «otro lugar» aplica sin dudas. */
const OTROS_LUGARES = [
  'arica',
  'parinacota',
  'tarapaca',
  'iquique',
  'alto hospicio',
  'antofagasta',
  'calama',
  'atacama',
  'copiapo',
  'coquimbo',
  'la serena',
  'ovalle',
  'ohiggins',
  'o higgins',
  'rancagua',
  'maule',
  'talca',
  'curico',
  'linares',
  'nuble',
  'chillan',
  'biobio',
  'bio bio',
  'concepcion',
  'talcahuano',
  'los angeles',
  'araucania',
  'temuco',
  'los rios',
  'valdivia',
  'los lagos',
  'puerto montt',
  'osorno',
  'aysen',
  'coyhaique',
  'magallanes',
  'punta arenas',
  'argentina',
  'buenos aires',
  'peru',
  'lima',
  'colombia',
  'bogota',
  'mexico',
  'espana',
  'madrid',
  'estados unidos',
  'usa',
  'brasil',
  'uruguay',
  'montevideo',
];

/** En qué zonas cae una ubicación escrita a mano; vacío si no se reconoce («Chile», «Remoto», «LATAM»). */
export function zonasDe(ubicacion: string): Zona[] {
  const t = normal(ubicacion);
  const en = (lista: string[]) => lista.some((x) => ` ${t} `.includes(` ${x} `));
  const zonas: Zona[] = [];
  if (en(COMUNAS_VALPARAISO)) zonas.push('valparaiso');
  // «Santiago» no puede venir solo de «Viña del Mar, Región de Valparaíso»; sí de «Santiago o Valparaíso».
  if (en(COMUNAS_SANTIAGO)) zonas.push('santiago');
  if (!zonas.length && en(OTROS_LUGARES)) zonas.push('otra');
  return zonas;
}

/** Montos en pesos de un sueldo escrito a mano: «$1.200.000 - $1.800.000», «1,5 millones». Null si no se lee. */
export function montosDe(sueldo: string): number[] | null {
  const t = sueldo.toLowerCase();
  if (/usd|us\$|d[oó]lar|uf\b|eur|€/.test(t)) return null;
  const montos: number[] = [];
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)*)\s*(millones|millon|mm|m\b)?/g)) {
    const crudo = m[1]!;
    const millones = Boolean(m[2]);
    let n: number;
    if (millones) n = Number(crudo.replace(',', '.')) * 1_000_000;
    else n = Number(crudo.replace(/[.,]/g, ''));
    if (Number.isFinite(n) && n >= 100_000) montos.push(n);
  }
  return montos.length ? montos : null;
}

export interface AvisoARevisar {
  titulo: string;
  modalidad: Modalidad;
  ubicacion: string;
  plataforma: Plataforma;
  sueldoPublicado?: string | null;
}

export interface ChoqueConPerfil {
  reglaId: string;
  dura: boolean;
  prioridad?: number;
  /** El texto de la regla, para que se entienda sin abrir el perfil. */
  regla: string;
  /** Por qué choca: «Presencial en Santiago; ahí solo aceptas híbrido o remoto». */
  texto: string;
}

export interface RevisionDePerfil {
  /** Falso si choca con una regla dura. Nunca cambia el estado (PB-D4). */
  cumpleDuras: boolean;
  choques: ChoqueConPerfil[];
  /** Reglas con chequeo que no se pudieron revisar porque al aviso le falta el dato. */
  sinDato: { reglaId: string; regla: string; texto: string }[];
}

type Resultado = { cumple: true } | { cumple: false; texto: string } | { sinDato: string };

function revisarTitulo(v: ValorTitulo, a: AvisoARevisar): Resultado {
  const titulo = normal(a.titulo);
  const incluida = v.incluir.find((x) => trae(titulo, x));
  if (incluida) return { cumple: true };
  const excluida = v.excluir.find((x) => trae(titulo, x));
  if (excluida) return { cumple: false, texto: `El título dice «${excluida}»` };
  if (v.incluir.length) return { sinDato: 'El título no dice el rol: revísalo leyendo el aviso' };
  return { cumple: true };
}

function revisarModalidad(v: ValorModalidad, a: AvisoARevisar): Resultado {
  let modalidad = a.modalidad;
  let porPlataforma = false;
  if (modalidad === 'no_indica') {
    if (!v.noIndicaEsPresencialEn.includes(a.plataforma)) return { sinDato: 'El aviso no dice la modalidad' };
    modalidad = 'presencial';
    porPlataforma = true;
  }
  const zonas = zonasDe(a.ubicacion);
  if (!zonas.length) {
    // Sin ubicación reconocible solo se sabe si la modalidad sirve en todas partes (remoto, por ejemplo).
    if (ZONAS.every((z) => v[z].includes(modalidad))) return { cumple: true };
    return { sinDato: `No se reconoce dónde queda «${a.ubicacion || 'sin ubicación'}»` };
  }
  if (zonas.some((z) => v[z].includes(modalidad))) return { cumple: true };
  const z = zonas[0]!;
  const como = porPlataforma
    ? `Sin modalidad en ${a.plataforma} cuenta como presencial`
    : MODALIDAD_EN_TEXTO[modalidad].replace(/^./, (x) => x.toUpperCase());
  return {
    cumple: false,
    texto: `${como} en ${ZONA_EN_TEXTO[z]}; ahí solo aceptas ${modalidades(v[z])}`,
  };
}

function revisarSueldo(v: ValorSueldo, a: AvisoARevisar, datos: DatosDeLaPersona): Resultado {
  if (!a.sueldoPublicado?.trim()) return { cumple: false, texto: 'No publica sueldo' };
  const minimo = v.minimo ?? datos.rentaPretendida;
  if (!minimo) return { cumple: true };
  const montos = montosDe(a.sueldoPublicado);
  if (!montos) return { cumple: true };
  const tope = Math.max(...montos);
  return tope >= minimo
    ? { cumple: true }
    : { cumple: false, texto: `Publica hasta ${pesos(tope)}, bajo los ${pesos(minimo)} que pides` };
}

/**
 * Revisa el aviso de una postulación contra las reglas con chequeo. Null si el perfil no tiene ninguna (no hay
 * nada que mostrar). Las reglas sin chequeo no entran: las aplica tu IA.
 */
export function revisarPostulacion(
  a: AvisoARevisar,
  p: Pick<DatosPerfilEmpleo, 'reglas' | 'datos'>,
): RevisionDePerfil | null {
  const conChequeo = p.reglas.filter((r) => r.criterio);
  if (!conChequeo.length) return null;
  const choques: ChoqueConPerfil[] = [];
  const sinDato: RevisionDePerfil['sinDato'] = [];
  for (const r of conChequeo) {
    const res =
      r.criterio === 'titulo'
        ? revisarTitulo(r.valor as ValorTitulo, a)
        : r.criterio === 'modalidad_por_region'
          ? revisarModalidad(r.valor as ValorModalidad, a)
          : revisarSueldo((r.valor ?? {}) as ValorSueldo, a, p.datos);
    if ('sinDato' in res) sinDato.push({ reglaId: r.id, regla: r.texto, texto: res.sinDato });
    else if (!res.cumple)
      choques.push({
        reglaId: r.id,
        dura: r.dura,
        ...(r.prioridad ? { prioridad: r.prioridad } : {}),
        regla: r.texto,
        texto: res.texto,
      });
  }
  choques.sort((x, y) => Number(y.dura) - Number(x.dura) || (x.prioridad ?? 0) - (y.prioridad ?? 0));
  return { cumpleDuras: !choques.some((c) => c.dura), choques, sinDato };
}

/** Puerto del perfil de Empleo (una sola fila). */
export interface PerfilEmpleoRepositorio {
  leer(): Promise<PerfilEmpleo>;
  guardar(p: PerfilEmpleo): Promise<void>;
}
