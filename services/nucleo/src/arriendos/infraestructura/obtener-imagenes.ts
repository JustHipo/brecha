import { lookup } from 'node:dns/promises';
import { open, stat } from 'node:fs/promises';
import { request as pedirHttp, type IncomingMessage } from 'node:http';
import { request as pedirHttps } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { homedir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ObtenedorDeImagenes } from '../aplicacion/puertos';
import { LIMITES_DE_FOTOS } from '../dominio/foto';
import { DatoInvalido } from '../dominio/valores';

// ── ¿Es pública una dirección IP? (docs/diseno/fotos-propiedades.md F-D7) ──

function ipv4ANumero(ip: string): number {
  return ip.split('.').reduce((n, x) => n * 256 + Number(x), 0);
}

/** Rangos IPv4 que no son internet pública (RFC 6890 y compañía). */
const PRIVADAS_V4: [string, number][] = [
  ['0.0.0.0', 8], // «esta red»
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // enlace local (metadatos de nubes)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // documentación
  ['192.88.99.0', 24], // relay 6to4
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // pruebas de rendimiento
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservadas y broadcast
];

function ipv4EsPublica(ip: string): boolean {
  const n = ipv4ANumero(ip);
  return !PRIVADAS_V4.some(([base, bits]) => {
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mascara) >>> 0 === (ipv4ANumero(base) & mascara) >>> 0;
  });
}

/** IPv6 a sus 8 grupos de 16 bits (acepta `::` y una IPv4 al final, como `::ffff:10.0.0.1`). */
function gruposIpv6(ip: string): number[] {
  let texto = ip.toLowerCase().split('%')[0]!;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(texto);
  if (v4) {
    const n = ipv4ANumero(v4[1]!);
    texto = `${texto.slice(0, -v4[1]!.length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [izq, der] = texto.split('::');
  const a = izq ? izq.split(':') : [];
  const b = der !== undefined ? (der ? der.split(':') : []) : [];
  const relleno = der !== undefined ? Array<string>(8 - a.length - b.length).fill('0') : [];
  return [...a, ...relleno, ...b].map((g) => parseInt(g || '0', 16));
}

function ipv4Dentro(g: number[], desde: number): string {
  return [g[desde]! >> 8, g[desde]! & 0xff, g[desde + 1]! >> 8, g[desde + 1]! & 0xff].join('.');
}

function ipv6EsPublica(ip: string): boolean {
  const g = gruposIpv6(ip);
  if (g.length !== 8 || g.some((x) => Number.isNaN(x))) return false;
  const ceros = (hasta: number) => g.slice(0, hasta).every((x) => x === 0);
  // IPv4 escondidas: mapeada (::ffff:a.b.c.d), compatible (::a.b.c.d), NAT64 (64:ff9b::/96) y 6to4 (2002::/16).
  if (ceros(5) && g[5] === 0xffff) return ipv4EsPublica(ipv4Dentro(g, 6));
  if (ceros(6)) return false; // ::, ::1 y las compatibles viejas
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))
    return ipv4EsPublica(ipv4Dentro(g, 6));
  if (g[0] === 0x2002) return ipv4EsPublica(ipv4Dentro(g, 1));
  // Solo unicast global (2000::/3), sin documentación (2001:db8::/32) ni Teredo (2001::/32).
  if ((g[0]! & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return false;
  return true;
}

/** ¿Se puede descargar desde esta dirección? Local, privada, reservada o de enlace local: no. */
export function esDireccionPublica(ip: string): boolean {
  const familia = isIP(ip);
  if (familia === 4) return ipv4EsPublica(ip);
  if (familia === 6) return ipv6EsPublica(ip);
  return false;
}

// ── Descarga ──

export interface Direccion {
  address: string;
  family: number;
}

export interface OpcionesDeDescarga {
  /** Solo en pruebas: resolver nombres sin DNS. */
  resolver?: (host: string) => Promise<Direccion[]>;
  /** Solo en pruebas: aceptar 127.0.0.1 de un servidor local. */
  esPublica?: (ip: string) => boolean;
  /** Solo en pruebas: un servidor local escucha en otro puerto. */
  puertos?: number[] | 'cualquiera';
  tiempoMs?: number;
  maxBytes?: number;
  maxRedirecciones?: number;
}

const AGENTE = 'Brecha/0.2 (seguimiento personal de arriendos)';

function fallo(mensaje: string): DatoInvalido {
  return new DatoInvalido('fotos', mensaje);
}

/**
 * Baja imágenes de internet y lee archivos de tu equipo, con las reglas de F-D7 y F-D9. La conexión va a la IP que se
 * revisó (sin una segunda consulta DNS que pueda cambiar la respuesta) y cada redirección se revisa igual.
 */
export class ObtenedorSeguro implements ObtenedorDeImagenes {
  private readonly resolver: (host: string) => Promise<Direccion[]>;
  private readonly esPublica: (ip: string) => boolean;
  private readonly puertos: number[] | 'cualquiera';
  private readonly tiempoMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirecciones: number;

  constructor(o: OpcionesDeDescarga = {}) {
    this.resolver = o.resolver ?? ((host) => lookup(host, { all: true, verbatim: true }));
    this.esPublica = o.esPublica ?? esDireccionPublica;
    this.puertos = o.puertos ?? [80, 443];
    this.tiempoMs = o.tiempoMs ?? 20_000;
    this.maxBytes = o.maxBytes ?? LIMITES_DE_FOTOS.bytes;
    this.maxRedirecciones = o.maxRedirecciones ?? 3;
  }

  /** Revisa la URL y resuelve su nombre. Devuelve la dirección a la que se conecta. */
  async revisar(url: URL): Promise<Direccion> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw fallo('Solo se descargan imágenes por http o https');
    if (url.username || url.password) throw fallo('La URL no puede traer usuario ni clave');
    const puerto = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (this.puertos !== 'cualquiera' && !this.puertos.includes(puerto))
      throw fallo('Solo se descargan imágenes de los puertos 80 y 443');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let direcciones: Direccion[];
    try {
      direcciones = isIP(host) ? [{ address: host, family: isIP(host) }] : await this.resolver(host);
    } catch {
      throw fallo(`No se encontró el servidor ${host}`);
    }
    if (!direcciones.length) throw fallo(`No se encontró el servidor ${host}`);
    // Si alguna de sus direcciones es local o privada, no se descarga (un nombre público que apunta adentro).
    if (direcciones.some((d) => !this.esPublica(d.address)))
      throw fallo('Esa dirección es local o privada: Brecha solo descarga de internet pública');
    return direcciones[0]!;
  }

  async descargar(texto: string): Promise<{ bytes: Uint8Array; urlFinal: string }> {
    let url: URL;
    try {
      url = new URL(texto);
    } catch {
      throw fallo('La URL no es válida');
    }
    const limite = Date.now() + this.tiempoMs;
    for (let salto = 0; ; salto++) {
      const direccion = await this.revisar(url);
      const r = await this.pedir(url, direccion, limite);
      if (r.tipo === 'imagen') return { bytes: r.bytes, urlFinal: url.toString() };
      if (salto >= this.maxRedirecciones) throw fallo('La imagen redirige demasiadas veces');
      try {
        url = new URL(r.a, url);
      } catch {
        throw fallo('La imagen redirige a una URL no válida');
      }
    }
  }

  private pedir(
    url: URL,
    direccion: Direccion,
    limite: number,
  ): Promise<{ tipo: 'imagen'; bytes: Uint8Array } | { tipo: 'redireccion'; a: string }> {
    // Fija la IP revisada: Node no vuelve a preguntar al DNS (ni con autoSelectFamily, que pide `all`).
    const fijada: LookupFunction = (_host, opciones, cb) => {
      if ((opciones as { all?: boolean }).all)
        (cb as unknown as (e: null, d: Direccion[]) => void)(null, [direccion]);
      else cb(null, direccion.address, direccion.family);
    };
    const pedir = url.protocol === 'https:' ? pedirHttps : pedirHttp;
    return new Promise((listo, falla) => {
      const restante = limite - Date.now();
      if (restante <= 0) return falla(fallo('La descarga tardó demasiado'));
      let terminado = false;
      const terminar = (e: DatoInvalido | null, valor?: Parameters<typeof listo>[0]) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(reloj);
        if (e) {
          req.destroy();
          falla(e);
        } else listo(valor!);
      };
      const req = pedir(
        url,
        {
          method: 'GET',
          lookup: fijada,
          agent: false,
          headers: {
            'user-agent': AGENTE,
            accept: 'image/webp,image/jpeg,image/png;q=0.9',
            'accept-encoding': 'identity',
          },
        },
        (res: IncomingMessage) => {
          const estado = res.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(estado) && res.headers.location) {
            res.resume();
            return terminar(null, { tipo: 'redireccion', a: res.headers.location });
          }
          if (estado !== 200) {
            res.resume();
            return terminar(fallo(`No se pudo descargar la imagen (HTTP ${estado})`));
          }
          const largo = Number(res.headers['content-length'] ?? 0);
          if (largo > this.maxBytes) {
            res.resume();
            return terminar(fallo('La imagen pesa más de 10 MB'));
          }
          const trozos: Buffer[] = [];
          let total = 0;
          res.on('data', (t: Buffer) => {
            total += t.length;
            if (total > this.maxBytes) return terminar(fallo('La imagen pesa más de 10 MB'));
            trozos.push(t);
          });
          res.on('end', () => terminar(null, { tipo: 'imagen', bytes: Buffer.concat(trozos) }));
          res.on('error', () => terminar(fallo('La descarga se cortó')));
        },
      );
      const reloj = setTimeout(() => terminar(fallo('La descarga tardó demasiado')), restante);
      req.on('error', (e: NodeJS.ErrnoException) =>
        terminar(fallo(`No se pudo descargar la imagen${e.code ? ` (${e.code})` : ''}`)),
      );
      req.end();
    });
  }

  /** Un archivo de tu equipo (F-D9): ruta absoluta, `~/…` o `file://`. Solo un archivo normal de hasta 10 MB. */
  async leerLocal(texto: string): Promise<{ bytes: Uint8Array; nombre: string }> {
    let ruta = texto.trim();
    if (/^file:/i.test(ruta)) {
      try {
        ruta = fileURLToPath(ruta);
      } catch {
        throw fallo('La ruta file:// no es válida en este equipo');
      }
    }
    if (/^~[\\/]/.test(ruta)) ruta = join(homedir(), ruta.slice(2));
    if (!isAbsolute(ruta)) throw fallo('La ruta debe ser completa');
    const nombre = basename(ruta);
    let info;
    try {
      info = await stat(ruta);
    } catch (e) {
      const codigo = (e as NodeJS.ErrnoException).code;
      throw fallo(codigo === 'ENOENT' ? `No existe el archivo ${nombre}` : `No se pudo leer ${nombre}`);
    }
    if (!info.isFile()) throw fallo(`${nombre} no es un archivo`);
    if (info.size > this.maxBytes) throw fallo('La imagen pesa más de 10 MB');
    const archivo = await open(ruta, 'r').catch(() => {
      throw fallo(`No se pudo leer ${nombre}`);
    });
    try {
      // Lee hasta el límite + 1: si el archivo creció entre stat y open, igual se nota.
      const b = Buffer.alloc(Math.min(info.size, this.maxBytes) + 1);
      const { bytesRead } = await archivo.read(b, 0, b.length, 0);
      if (bytesRead > this.maxBytes) throw fallo('La imagen pesa más de 10 MB');
      return { bytes: b.subarray(0, bytesRead), nombre };
    } finally {
      await archivo.close();
    }
  }
}
