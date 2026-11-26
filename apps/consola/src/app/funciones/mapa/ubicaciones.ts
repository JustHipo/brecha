/**
 * De texto a lugar (docs/diseno/arriendos.md §6, P11): la ubicación de un aviso de empleo es texto
 * («Las Condes, Santiago», «Híbrido · Providencia», «Remoto»). Se lleva a una comuna de la tabla local para
 * juntar en un pin todas las postulaciones de esa comuna. Nada de esto sale a internet.
 */

export interface Comuna {
  n: string;
  lat: number;
  lon: number;
}

export type Lugar =
  { tipo: 'comuna'; comuna: Comuna } | { tipo: 'remoto' } | { tipo: 'sin_ubicar' };

export function normal(t: string): string {
  return t
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lo que no es una comuna pero apunta a una (la ciudad o la región por su capital). */
const SINONIMOS: Record<string, string> = {
  'region metropolitana': 'Santiago',
  'region metropolitana de santiago': 'Santiago',
  rm: 'Santiago',
  'santiago de chile': 'Santiago',
  'gran santiago': 'Santiago',
  stgo: 'Santiago',
  'santiago centro': 'Santiago',
  'region de valparaiso': 'Valparaíso',
  'gran valparaiso': 'Valparaíso',
  'region del biobio': 'Concepción',
  'gran concepcion': 'Concepción',
  'region de antofagasta': 'Antofagasta',
  'region de la araucania': 'Temuco',
  'region de los lagos': 'Puerto Montt',
  'region de coquimbo': 'La Serena',
  'region de ohiggins': 'Rancagua',
  'region del maule': 'Talca',
};

const REMOTO = /\b(remoto|remote|teletrabajo|100% online|a distancia)\b/;
const RUIDO = /\b(hibrido|hybrid|presencial|on ?site|chile|cl)\b/g;

export class Ubicador {
  private readonly porNombre = new Map<string, Comuna>();

  constructor(comunas: Comuna[]) {
    for (const c of comunas) this.porNombre.set(normal(c.n), c);
  }

  /** La primera parte del texto que sea una comuna (o un sinónimo) gana: «Las Condes, Santiago» es Las Condes. */
  lugar(texto: string | null | undefined, modalidad?: string): Lugar {
    const t = normal(texto ?? '');
    if (REMOTO.test(t) || (modalidad === 'remoto' && !t)) return { tipo: 'remoto' };
    const partes = t
      .split(/[,;/|·()\-–]+/)
      .map((p) => p.replace(RUIDO, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    for (const p of partes) {
      const c = this.porNombre.get(p) ?? this.porNombre.get(normal(SINONIMOS[p] ?? ''));
      if (c) return { tipo: 'comuna', comuna: c };
    }
    if (modalidad === 'remoto') return { tipo: 'remoto' };
    return { tipo: 'sin_ubicar' };
  }
}

export interface Grupo<T> {
  comuna: Comuna;
  items: T[];
}

/** Junta los elementos por comuna, de la que tiene más a la que tiene menos. */
export function agrupar<T>(
  items: T[],
  lugar: (x: T) => Lugar,
): { grupos: Grupo<T>[]; remotos: T[]; sinUbicar: T[] } {
  const grupos = new Map<string, Grupo<T>>();
  const remotos: T[] = [];
  const sinUbicar: T[] = [];
  for (const x of items) {
    const l = lugar(x);
    if (l.tipo === 'comuna') {
      const g = grupos.get(l.comuna.n) ?? { comuna: l.comuna, items: [] };
      g.items.push(x);
      grupos.set(l.comuna.n, g);
    } else if (l.tipo === 'remoto') remotos.push(x);
    else sinUbicar.push(x);
  }
  return {
    grupos: [...grupos.values()].sort((a, b) => b.items.length - a.items.length),
    remotos,
    sinUbicar,
  };
}
