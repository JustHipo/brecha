import type { Deps } from '../../compartido/dominio/puertos';
import { DatoInvalido, siNoOpcional, texto, uno, vacio } from './valores';

/**
 * Por dónde aparece una propiedad o hablas con alguien (docs/diseno/arriendos.md §5.3, P3): portales,
 * WhatsApp, correo, teléfono, corredoras. Juan o su IA agregan los que falten, sin tocar código.
 */
export const TIPOS_DE_CANAL = ['portal', 'mensajeria', 'correo', 'telefono', 'corredora', 'otro'] as const;
export type TipoDeCanal = (typeof TIPOS_DE_CANAL)[number];

export interface DatosCanal {
  id: string;
  nombre: string;
  tipo: TipoDeCanal;
  /** Dominios web del canal (`portalinmobiliario.com`): reconocen sus URLs y sus correos. */
  dominios: string[];
  activo: boolean;
  predefinido: boolean;
  creadoEn: Date;
}

/** Los que vienen de partida. Los ids son fijos para que la IA y las pruebas los nombren igual. */
export const CANALES_INICIALES: readonly Omit<DatosCanal, 'creadoEn' | 'activo' | 'predefinido'>[] = [
  {
    id: 'portalinmobiliario',
    nombre: 'Portal Inmobiliario',
    tipo: 'portal',
    dominios: ['portalinmobiliario.com'],
  },
  { id: 'yapo', nombre: 'Yapo', tipo: 'portal', dominios: ['yapo.cl'] },
  { id: 'toctoc', nombre: 'Toctoc', tipo: 'portal', dominios: ['toctoc.com'] },
  { id: 'goplaceit', nombre: 'Goplaceit', tipo: 'portal', dominios: ['goplaceit.com'] },
  { id: 'icasas', nombre: 'iCasas', tipo: 'portal', dominios: ['icasas.cl'] },
  {
    id: 'facebook',
    nombre: 'Facebook Marketplace',
    tipo: 'portal',
    dominios: ['facebook.com', 'fb.com'],
  },
  { id: 'whatsapp', nombre: 'WhatsApp', tipo: 'mensajeria', dominios: ['wa.me', 'whatsapp.com'] },
  { id: 'correo', nombre: 'Correo', tipo: 'correo', dominios: [] },
  { id: 'telefono', nombre: 'Teléfono', tipo: 'telefono', dominios: [] },
];

const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;

/** `https://www.Yapo.cl/algo` → `yapo.cl`. */
export function dominioNormalizado(v: unknown): string {
  const t = texto('dominios', v, 200).toLowerCase();
  const sinEsquema = t.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const dominio = sinEsquema.split(/[/?#:]/)[0] ?? '';
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio))
    throw new DatoInvalido('dominios', `«${t}» no es un dominio`);
  return dominio;
}

/** «Mi Corredora SpA» → «mi-corredora-spa». */
export function idDeNombre(nombre: string): string {
  return nombre
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export class Canal {
  private constructor(private d: DatosCanal) {}

  static crear(
    e: { nombre: unknown; tipo?: unknown; dominios?: unknown; id?: unknown },
    deps: Pick<Deps, 'reloj'>,
  ): Canal {
    const nombre = texto('nombre', e.nombre, 100);
    const id = vacio(e.id) ? idDeNombre(nombre) : texto('id', e.id, 60);
    if (!ID.test(id)) throw new DatoInvalido('id', 'El id va en minúsculas, números y guiones');
    return new Canal({
      id,
      nombre,
      tipo: uno('tipo', TIPOS_DE_CANAL, e.tipo ?? 'portal'),
      dominios: dominios(e.dominios),
      activo: true,
      predefinido: false,
      creadoEn: deps.reloj.ahora(),
    });
  }

  static inicial(d: (typeof CANALES_INICIALES)[number], ahora: Date): Canal {
    return new Canal({ ...d, dominios: [...d.dominios], activo: true, predefinido: true, creadoEn: ahora });
  }

  static reconstituir(d: DatosCanal): Canal {
    return new Canal({ ...d, dominios: [...d.dominios] });
  }

  get id(): string {
    return this.d.id;
  }

  datos(): DatosCanal {
    return { ...this.d, dominios: [...this.d.dominios] };
  }

  editar(e: { nombre?: unknown; tipo?: unknown; dominios?: unknown; activo?: unknown }): void {
    if (e.nombre !== undefined) this.d.nombre = texto('nombre', e.nombre, 100);
    if (e.tipo !== undefined) this.d.tipo = uno('tipo', TIPOS_DE_CANAL, e.tipo);
    if (e.dominios !== undefined) this.d.dominios = dominios(e.dominios);
    const activo = siNoOpcional('activo', e.activo);
    if (activo !== undefined) this.d.activo = activo;
  }

  /** Si la URL o el correo son de este canal. */
  reconoce(direccion: string): boolean {
    const t = direccion.toLowerCase();
    const host = t.includes('@') ? t.split('@')[1]! : t.replace(/^https?:\/\//, '').split(/[/?#:]/)[0]!;
    return this.d.dominios.some((d) => host === d || host.endsWith(`.${d}`));
  }
}

function dominios(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new DatoInvalido('dominios', 'Los dominios van en una lista');
  return [...new Set(v.map(dominioNormalizado))].slice(0, 20);
}
