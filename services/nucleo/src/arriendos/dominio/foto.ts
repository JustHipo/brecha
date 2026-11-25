import { DatoInvalido } from './valores';

/**
 * Fotos de una propiedad (docs/diseno/fotos-propiedades.md). Reglas puras: qué es una imagen válida, de dónde viene
 * y en qué orden van. La portada es siempre la primera (F-D2).
 */

/** F-D6, validados por Juan el 25-nov-2026. */
export const LIMITES_DE_FOTOS = {
  bytes: 10 * 1024 * 1024,
  porPropiedad: 40,
  porLlamada: 20,
} as const;

export const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type TipoDeFoto = (typeof TIPOS_DE_FOTO)[number];

export const EXTENSION: Record<TipoDeFoto, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * El tipo por los primeros bytes (F-D5), nunca por la extensión ni por el `Content-Type`. null si no es jpg, png ni
 * webp (por ejemplo, una página HTML de error que llegó con nombre `.jpg`).
 */
export function tipoDeImagen(b: Uint8Array): TipoDeFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((x, i) => b[i] === x)) return 'image/png';
  const ascii = (desde: number, hasta: number) => String.fromCharCode(...b.subarray(desde, hasta));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Revisa una imagen ya leída: tamaño y tipo. Devuelve el tipo. */
export function validarImagen(b: Uint8Array): TipoDeFoto {
  if (b.length === 0) throw new DatoInvalido('fotos', 'El archivo está vacío');
  if (b.length > LIMITES_DE_FOTOS.bytes) throw new DatoInvalido('fotos', 'La imagen pesa más de 10 MB');
  const tipo = tipoDeImagen(b);
  if (!tipo) throw new DatoInvalido('fotos', 'No es una imagen jpg, png ni webp');
  return tipo;
}

export type FuenteDeFoto = { tipo: 'url'; url: string } | { tipo: 'archivo'; ruta: string };

/**
 * ¿Es una URL o una ruta de tu equipo? `C:\fotos\a.jpg` parece una URL con esquema `c:`, por eso se miran primero
 * las rutas de Windows. `file://` es una ruta. Cualquier otro esquema (ftp, data, javascript…) se rechaza.
 */
export function fuenteDeFoto(valor: string): FuenteDeFoto {
  const v = valor.trim();
  if (!v) throw new DatoInvalido('fotos', 'Falta la URL o la ruta de la foto');
  if (v.length > 4000) throw new DatoInvalido('fotos', 'La URL o la ruta es demasiado larga');
  if (/^[a-z]:[\\/]/i.test(v) || v.startsWith('\\\\')) return { tipo: 'archivo', ruta: v };
  if (/^(\/|~[\\/])/.test(v)) return { tipo: 'archivo', ruta: v };
  const esquema = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
  if (esquema === 'http' || esquema === 'https') return { tipo: 'url', url: v };
  if (esquema === 'file') return { tipo: 'archivo', ruta: v };
  if (esquema)
    throw new DatoInvalido(
      'fotos',
      `Solo se aceptan URL http o https y rutas de tu equipo (llegó ${esquema}:)`,
    );
  throw new DatoInvalido('fotos', 'La ruta debe ser completa (por ejemplo /Users/… o C:\\Users\\…)');
}

/** Una foto tal como la ordena el dominio. */
export interface FotoOrdenable {
  id: string;
  orden: number;
}

/**
 * «Elegir portada» (F-D2): la elegida pasa al frente y las demás conservan su orden. Devuelve el orden nuevo de cada
 * id (0, 1, 2…), sin huecos.
 */
export function conPortada<T extends FotoOrdenable>(
  fotos: readonly T[],
  portadaId: string,
): Map<string, number> {
  const orden = [...fotos].sort((a, b) => a.orden - b.orden);
  const elegida = orden.find((f) => f.id === portadaId);
  if (!elegida) throw new DatoInvalido('fotoId', 'Esa foto no es de esta propiedad');
  return new Map([elegida, ...orden.filter((f) => f !== elegida)].map((f, i) => [f.id, i]));
}

/** Después de quitar una o de unir dos propiedades: 0, 1, 2… en el mismo orden relativo. */
export function sinHuecos<T extends FotoOrdenable>(fotos: readonly T[]): Map<string, number> {
  return new Map([...fotos].sort((a, b) => a.orden - b.orden).map((f, i) => [f.id, i]));
}

/** Una llamada trae a lo más 20 fuentes (F-D6). */
export function revisarLlamada(cantidad: number): void {
  if (cantidad === 0) throw new DatoInvalido('fotos', 'Falta al menos una foto');
  if (cantidad > LIMITES_DE_FOTOS.porLlamada)
    throw new DatoInvalido('fotos', `Hasta ${LIMITES_DE_FOTOS.porLlamada} fotos por vez`);
}

/** ¿Cabe una foto más en una propiedad que ya tiene `actuales`? (40, F-D6) */
export function revisarCupo(actuales: number): void {
  if (actuales >= LIMITES_DE_FOTOS.porPropiedad)
    throw new DatoInvalido('fotos', `La propiedad ya tiene ${LIMITES_DE_FOTOS.porPropiedad} fotos`);
}
