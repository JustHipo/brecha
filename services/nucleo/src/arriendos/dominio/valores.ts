import { ErrorDeDominio } from '../../compartido/dominio/error-de-dominio';
import { esFecha, type Fecha } from '../../compartido/dominio/puertos';

// ── Errores del contexto (mismos códigos que empleo, para que REST y MCP los traduzcan igual) ──

export class DatoInvalido extends ErrorDeDominio {
  readonly codigo = 'VALIDACION';
  constructor(campo: string, mensaje: string) {
    super(mensaje, campo);
  }
}

export class NoEncontrado extends ErrorDeDominio {
  readonly codigo = 'NO_ENCONTRADO';
  constructor(que: string) {
    super(`${que} no existe`);
  }
}

export class TransicionInvalida extends ErrorDeDominio {
  readonly codigo = 'TRANSICION_INVALIDA';
  constructor(de: string, a: string) {
    super(`No se puede pasar de ${de} a ${a}`, 'a');
  }
}

export class EstadoTerminal extends ErrorDeDominio {
  readonly codigo = 'ESTADO_TERMINAL';
  constructor() {
    super('La propiedad está en un estado terminal');
  }
}

/** Ya sigues esta propiedad (la misma URL). Trae el id para unir la publicación nueva. */
export class PropiedadDuplicada extends ErrorDeDominio {
  readonly codigo = 'YA_EXISTE';
  constructor(readonly existenteId: string) {
    super(`Ya sigues esta propiedad (id ${existenteId})`, 'url');
  }
}

export class ConflictoDeVersion extends ErrorDeDominio {
  readonly codigo = 'CONFLICTO';
  constructor() {
    super('La propiedad cambió en otro lado', 'version');
  }
}

// ── Catálogos ──

export const TIPOS_DE_PROPIEDAD = ['departamento', 'casa', 'pieza', 'otro'] as const;
export type TipoDePropiedad = (typeof TIPOS_DE_PROPIEDAD)[number];

export const MONEDAS = ['CLP', 'UF'] as const;
export type Moneda = (typeof MONEDAS)[number];

export const ROLES_DE_CONTACTO = ['corredor', 'dueno', 'conserje', 'administracion', 'otro'] as const;
export type RolDeContacto = (typeof ROLES_DE_CONTACTO)[number];

export const TIPOS_DE_INTERACCION = ['mensaje_enviado', 'mensaje_recibido', 'llamada', 'nota'] as const;
export type TipoDeInteraccion = (typeof TIPOS_DE_INTERACCION)[number];

/** Quién hizo el cambio: la persona en la consola, su IA por MCP, una señal, o una importación. */
export const ORIGENES = ['consola', 'ia', 'senal', 'importacion', 'correo'] as const;
export type Origen = (typeof ORIGENES)[number];

export const FUENTES_DE_SENAL = ['correo', 'portal', 'mensajeria', 'manual', 'ia'] as const;
export type FuenteDeSenal = (typeof FUENTES_DE_SENAL)[number];
/** Fuentes automáticas: sus señales seguras cambian el estado solas (D27). */
export const FUENTES_AUTOMATICAS: readonly FuenteDeSenal[] = ['correo', 'portal'];

// ── Validación ──

export function esUno<T extends string>(lista: readonly T[], valor: unknown): valor is T {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor);
}

export function uno<T extends string>(campo: string, lista: readonly T[], valor: unknown): T {
  if (!esUno(lista, valor)) throw new DatoInvalido(campo, `${campo}: valor desconocido`);
  return valor;
}

export function texto(campo: string, valor: unknown, max = 500): string {
  if (typeof valor !== 'string' || valor.trim() === '')
    throw new DatoInvalido(campo, `${campo} es obligatorio`);
  const limpio = valor.replace(/\s+/g, ' ').trim();
  if (limpio.length > max) throw new DatoInvalido(campo, `${campo} admite hasta ${max} caracteres`);
  return limpio;
}

export function textoLargo(campo: string, valor: unknown, max = 5000): string {
  if (typeof valor !== 'string' || valor.trim() === '')
    throw new DatoInvalido(campo, `${campo} es obligatorio`);
  const limpio = valor.trim();
  if (limpio.length > max) throw new DatoInvalido(campo, `${campo} admite hasta ${max} caracteres`);
  return limpio;
}

export const vacio = (v: unknown) => v === undefined || v === null || v === '';

export function textoOpcional(campo: string, valor: unknown, max = 500): string | undefined {
  return vacio(valor) ? undefined : texto(campo, valor, max);
}

export function numero(campo: string, valor: unknown, min = 0, max = 1e12): number {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
    throw new DatoInvalido(campo, `${campo} debe ser un número entre ${min} y ${max}`);
  return n;
}

export function numeroOpcional(campo: string, valor: unknown, min = 0, max = 1e12): number | undefined {
  return vacio(valor) ? undefined : numero(campo, valor, min, max);
}

export function entero(campo: string, valor: unknown, min = 0, max = 1000): number {
  const n = numero(campo, valor, min, max);
  if (!Number.isInteger(n)) throw new DatoInvalido(campo, `${campo} debe ser un número entero`);
  return n;
}

export function enteroOpcional(campo: string, valor: unknown, min = 0, max = 1000): number | undefined {
  return vacio(valor) ? undefined : entero(campo, valor, min, max);
}

export function siNoOpcional(campo: string, valor: unknown): boolean | undefined {
  if (vacio(valor)) return undefined;
  if (typeof valor !== 'boolean') throw new DatoInvalido(campo, `${campo} es sí o no`);
  return valor;
}

export function fecha(campo: string, valor: unknown): Fecha {
  if (typeof valor !== 'string' || !esFecha(valor))
    throw new DatoInvalido(campo, `${campo} debe ser una fecha AAAA-MM-DD`);
  return valor;
}

export function fechaOpcional(campo: string, valor: unknown): Fecha | undefined {
  return vacio(valor) ? undefined : fecha(campo, valor);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function correoOpcional(campo: string, valor: unknown): string | undefined {
  const t = textoOpcional(campo, valor, 200);
  if (t && !EMAIL.test(t)) throw new DatoInvalido(campo, `${campo} no es un correo válido`);
  return t?.toLowerCase();
}

/** Teléfono chileno o internacional: solo dígitos y un + inicial. «9 8765 4321» → «+56987654321». */
export function telefonoOpcional(campo: string, valor: unknown): string | undefined {
  const t = textoOpcional(campo, valor, 40);
  if (!t) return undefined;
  const digitos = t.replace(/[^\d+]/g, '');
  const solo = digitos.replace(/\+/g, '');
  if (solo.length < 8 || solo.length > 15) throw new DatoInvalido(campo, `${campo} no parece un teléfono`);
  if (digitos.startsWith('+')) return `+${solo}`;
  if (solo.length === 9 && solo.startsWith('9')) return `+56${solo}`;
  if (solo.length === 11 && solo.startsWith('56')) return `+${solo}`;
  return solo;
}

/** URL http(s) válida, hasta 1000 caracteres. */
export function urlOpcional(campo: string, valor: unknown): string | undefined {
  const t = textoOpcional(campo, valor, 1000);
  if (!t) return undefined;
  const conEsquema = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(conEsquema);
    if (!u.hostname.includes('.')) throw new Error('sin dominio');
    return u.toString();
  } catch {
    throw new DatoInvalido(campo, `${campo} no es una URL válida`);
  }
}

// ── Normalización para duplicados ──

const SEGUIMIENTO = /^(utm_|fbclid$|gclid$|ref$|source$|tracking|mc_|_ga$|position$|searchid$|origen$)/i;

/** La misma publicación con otra forma de URL: sin esquema, www, parámetros de seguimiento ni barra final. */
export function urlNormalizada(url: string): string {
  const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  const parametros = [...u.searchParams.entries()]
    .filter(([k]) => !SEGUIMIENTO.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const consulta = parametros.length ? `?${new URLSearchParams(parametros).toString()}` : '';
  const ruta = u.pathname.replace(/\/+$/, '');
  return `${u.hostname.toLowerCase().replace(/^www\./, '')}${ruta}${consulta}`;
}

export function sinTildes(t: string): string {
  return t.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

const ABREVIATURAS: [RegExp, string][] = [
  [/\bav(da)?\.?\s/g, 'avenida '],
  [/\bpje\.?\s/g, 'pasaje '],
  [/\bgral\.?\s/g, 'general '],
  [/\bstgo\b/g, 'santiago'],
  [/\bn[°º]\s*/g, ''],
  [/\s#\s*/g, ' '],
];

/** Dirección comparable: minúsculas, sin tildes, abreviaturas comunes y sin el departamento. */
export function direccionNormalizada(direccion: string): string {
  let t = ` ${sinTildes(direccion.toLowerCase())} `;
  for (const [re, por] of ABREVIATURAS) t = t.replace(re, por);
  t = t.replace(/\b(depto|dpto|departamento|depa|of|oficina|casa)\.?\s*[\w-]+/g, ' ');
  return t
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Comuna comparable: minúsculas y sin tildes («Ñuñoa» y «nunoa» son la misma). */
export function comunaNormalizada(comuna: string): string {
  return sinTildes(comuna.toLowerCase()).replace(/\s+/g, ' ').trim();
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaMetros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
