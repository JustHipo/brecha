import { esFecha, type Fecha } from '../../../compartido/dominio/puertos';
import { DatoInvalido } from '../errores';

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
export type Plataforma = (typeof PLATAFORMAS)[number];

export const MODALIDADES = ['remoto', 'hibrido', 'presencial', 'no_indica'] as const;
export type Modalidad = (typeof MODALIDADES)[number];

export const TIPOS_DE_CANAL = ['portal', 'email', 'formulario', 'referido'] as const;
export type TipoDeCanal = (typeof TIPOS_DE_CANAL)[number];

export const MONEDAS = ['CLP', 'USD'] as const;
export const PERIODOS = ['mes', 'anio', 'hora'] as const;
export const BASES = ['bruto', 'liquido'] as const;

export type Origen = 'tablero' | 'formulario' | 'ia' | 'senal' | 'importacion';
export const ORIGENES: readonly Origen[] = ['tablero', 'formulario', 'ia', 'senal', 'importacion'];

export interface AvisoResumen {
  readonly titulo: string;
  readonly empresa: string;
  readonly url: string;
  readonly plataforma: Plataforma;
  readonly modalidad: Modalidad;
  readonly ubicacion: string;
  readonly cierre?: Fecha;
  readonly avisoId?: string;
  readonly calce?: number;
  /** Herramientas que pide el aviso (csv.md §4.1); vacío o ausente si no las trae. */
  readonly stack?: readonly string[];
  /** Requisitos en texto libre, tal como los copió la persona. */
  readonly requisitos?: string;
  /** Sueldo tal como lo publica el aviso (no es el sueldo pretendido). */
  readonly sueldoPublicado?: string;
}

export const MAX_STACK = 40;

/** Herramientas del aviso: sin vacías ni repetidas (sin distinguir mayúsculas), cada una hasta 60 caracteres. */
export function crearStack(valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) throw new DatoInvalido('aviso.stack', 'El stack va en una lista');
  const salida: string[] = [];
  for (const v of valor) {
    if (typeof v !== 'string') throw new DatoInvalido('aviso.stack', 'Cada herramienta es un texto');
    const h = v.replace(/\s+/g, ' ').trim();
    if (!h) continue;
    if (h.length > 60)
      throw new DatoInvalido('aviso.stack', `Una herramienta admite hasta 60 caracteres: «${h}»`);
    if (!salida.some((x) => x.toLowerCase() === h.toLowerCase())) salida.push(h);
  }
  if (salida.length > MAX_STACK)
    throw new DatoInvalido('aviso.stack', `El stack admite hasta ${MAX_STACK} herramientas`);
  return salida;
}

export interface Canal {
  readonly tipo: TipoDeCanal;
  readonly valor: string;
}

export interface Dinero {
  readonly monto: number;
  readonly moneda: (typeof MONEDAS)[number];
  readonly periodo: (typeof PERIODOS)[number];
  readonly base: (typeof BASES)[number];
}

export interface Contacto {
  readonly id: string;
  readonly nombre: string;
  readonly rol?: string;
  readonly email?: string;
  readonly linkedin?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esUno<T extends string>(lista: readonly T[], valor: unknown): valor is T {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor);
}

export function textoObligatorio(campo: string, valor: unknown, max = 500): string {
  if (typeof valor !== 'string' || valor.trim() === '')
    throw new DatoInvalido(campo, `${campo} es obligatorio`);
  const limpio = valor.trim();
  if (limpio.length > max) throw new DatoInvalido(campo, `${campo} admite hasta ${max} caracteres`);
  return limpio;
}

export function textoOpcional(campo: string, valor: unknown, max = 500): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  return textoObligatorio(campo, valor, max);
}

export function fechaValida(campo: string, valor: unknown): Fecha {
  if (typeof valor !== 'string' || !esFecha(valor))
    throw new DatoInvalido(campo, `${campo} debe ser una fecha AAAA-MM-DD`);
  return valor;
}

export function crearAvisoResumen(d: {
  titulo: unknown;
  empresa: unknown;
  url: unknown;
  plataforma: unknown;
  modalidad?: unknown;
  ubicacion?: unknown;
  cierre?: unknown;
  avisoId?: unknown;
  calce?: unknown;
  stack?: unknown;
  requisitos?: unknown;
  sueldoPublicado?: unknown;
}): AvisoResumen {
  const url = textoObligatorio('aviso.url', d.url, 2000);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatoInvalido('aviso.url', 'La URL del aviso no es válida');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DatoInvalido('aviso.url', 'La URL del aviso debe ser http o https');
  }
  if (!esUno(PLATAFORMAS, d.plataforma)) throw new DatoInvalido('aviso.plataforma', 'Plataforma desconocida');
  const modalidad = d.modalidad ?? 'no_indica';
  if (!esUno(MODALIDADES, modalidad)) throw new DatoInvalido('aviso.modalidad', 'Modalidad desconocida');
  const cierre =
    d.cierre === undefined || d.cierre === null || d.cierre === ''
      ? undefined
      : fechaValida('aviso.cierre', d.cierre);
  let calce: number | undefined;
  if (d.calce !== undefined && d.calce !== null) {
    if (typeof d.calce !== 'number' || d.calce < 0 || d.calce > 1)
      throw new DatoInvalido('aviso.calce', 'El calce va de 0 a 1');
    calce = d.calce;
  }
  const stack = crearStack(d.stack);
  const requisitos = textoOpcional('aviso.requisitos', d.requisitos, 5000);
  const sueldoPublicado = textoOpcional('aviso.sueldoPublicado', d.sueldoPublicado, 200);
  return {
    titulo: textoObligatorio('aviso.titulo', d.titulo, 300),
    empresa: textoObligatorio('aviso.empresa', d.empresa, 200),
    url,
    plataforma: d.plataforma,
    modalidad,
    ubicacion: textoOpcional('aviso.ubicacion', d.ubicacion, 200) ?? '',
    ...(cierre ? { cierre } : {}),
    ...(d.avisoId ? { avisoId: textoObligatorio('aviso.avisoId', d.avisoId, 100) } : {}),
    ...(calce !== undefined ? { calce } : {}),
    ...(stack.length ? { stack } : {}),
    ...(requisitos ? { requisitos } : {}),
    ...(sueldoPublicado ? { sueldoPublicado } : {}),
  };
}

export function crearCanal(d: { tipo: unknown; valor: unknown }): Canal {
  if (!esUno(TIPOS_DE_CANAL, d.tipo)) throw new DatoInvalido('canal.tipo', 'Tipo de canal desconocido');
  const valor = textoObligatorio('canal.valor', d.valor, 500);
  if (d.tipo === 'email' && !EMAIL.test(valor))
    throw new DatoInvalido('canal.valor', 'El correo no es válido');
  return { tipo: d.tipo, valor };
}

export function crearDinero(d: {
  monto: unknown;
  moneda: unknown;
  periodo?: unknown;
  base?: unknown;
}): Dinero {
  if (typeof d.monto !== 'number' || !Number.isFinite(d.monto) || d.monto <= 0) {
    throw new DatoInvalido('sueldoPretendido.monto', 'El monto debe ser mayor que 0');
  }
  if (!esUno(MONEDAS, d.moneda)) throw new DatoInvalido('sueldoPretendido.moneda', 'Moneda desconocida');
  const periodo = d.periodo ?? 'mes';
  if (!esUno(PERIODOS, periodo)) throw new DatoInvalido('sueldoPretendido.periodo', 'Periodo desconocido');
  const base = d.base ?? 'bruto';
  if (!esUno(BASES, base)) throw new DatoInvalido('sueldoPretendido.base', 'Base desconocida');
  return { monto: d.monto, moneda: d.moneda, periodo, base };
}

export function crearContacto(
  id: string,
  d: { nombre: unknown; rol?: unknown; email?: unknown; linkedin?: unknown },
): Contacto {
  const nombre = textoObligatorio('nombre', d.nombre, 200);
  const rol = textoOpcional('rol', d.rol, 200);
  const email = textoOpcional('email', d.email, 320);
  const linkedin = textoOpcional('linkedin', d.linkedin, 500);
  if (!email && !linkedin) throw new DatoInvalido('email', 'Hace falta un correo o un perfil de LinkedIn');
  if (email && !EMAIL.test(email)) throw new DatoInvalido('email', 'El correo no es válido');
  return {
    id,
    nombre,
    ...(rol ? { rol } : {}),
    ...(email ? { email } : {}),
    ...(linkedin ? { linkedin } : {}),
  };
}

/** Plataforma deducida del dominio de la URL del aviso (cuando la fila no la trae). */
export function plataformaDesdeUrl(url: string): Plataforma {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (host.includes('linkedin.')) return 'linkedin';
  if (host.includes('trabajando.')) return 'trabajando';
  if (host.includes('getonbrd.') || host.includes('getonboard.')) return 'getonboard';
  if (host.includes('chiletrabajos.')) return 'chiletrabajos';
  if (host.includes('computrabajo.')) return 'computrabajo';
  if (host.includes('indeed.')) return 'indeed';
  return host ? 'sitio_empresa' : 'otra';
}
