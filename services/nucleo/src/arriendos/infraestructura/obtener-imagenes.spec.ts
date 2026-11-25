import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { esDireccionPublica, ObtenedorSeguro, type Direccion } from './obtener-imagenes';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('direcciones públicas y privadas (F-D7)', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::127.0.0.1',
    '64:ff9b::a00:1',
    '2002:7f00:1::',
    '2001:db8::1',
    '2001::1',
    'no-es-ip',
  ])('%s no es pública', (ip) => expect(esDireccionPublica(ip)).toBe(false));

  it.each([
    '8.8.8.8',
    '23.55.1.1',
    '172.32.0.1',
    '192.169.0.1',
    '2800:150:1::1',
    '2a00:1450:4001::200e',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
  ])('%s es pública', (ip) => expect(esDireccionPublica(ip)).toBe(true));
});

describe('revisar una URL antes de descargar', () => {
  const resolver =
    (mapa: Record<string, string[]>) =>
    async (host: string): Promise<Direccion[]> => {
      const d = mapa[host];
      if (!d) throw Object.assign(new Error('no'), { code: 'ENOTFOUND' });
      return d.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    };
  const o = new ObtenedorSeguro({
    resolver: resolver({
      'publico.cl': ['200.1.1.1'],
      'mixto.cl': ['200.1.1.1', '10.0.0.5'],
      'interno.cl': ['192.168.0.10'],
      'v6.cl': ['::1'],
    }),
  });

  it('acepta un nombre que solo resuelve a direcciones públicas', async () => {
    await expect(o.revisar(new URL('https://publico.cl/a.webp'))).resolves.toEqual({
      address: '200.1.1.1',
      family: 4,
    });
  });

  it.each([
    ['ftp://publico.cl/a.jpg', 'http o https'],
    ['https://usuario:clave@publico.cl/a.jpg', 'usuario ni clave'],
    ['https://publico.cl:8443/a.jpg', 'puertos 80 y 443'],
    ['http://publico.cl:22/a.jpg', 'puertos 80 y 443'],
    ['https://interno.cl/a.jpg', 'local o privada'],
    ['https://mixto.cl/a.jpg', 'local o privada'],
    ['https://v6.cl/a.jpg', 'local o privada'],
    ['http://127.0.0.1/a.jpg', 'local o privada'],
    ['http://[::1]/a.jpg', 'local o privada'],
    ['http://[::ffff:169.254.169.254]/latest/meta-data', 'local o privada'],
    ['http://0x7f000001/a.jpg', 'local o privada'],
    ['https://no-existe.cl/a.jpg', 'No se encontró'],
  ])('%s → %s', async (url, mensaje) => {
    await expect(o.descargar(url)).rejects.toThrow(mensaje);
  });

  it('una URL que no es URL', async () => {
    await expect(o.descargar('no es url')).rejects.toThrow('no es válida');
  });
});

describe('descargar de un servidor (local en la prueba)', () => {
  let servidor: Server;
  let base: string;
  let o: ObtenedorSeguro;

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      const ruta = req.url ?? '/';
      if (ruta === '/a.png') {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(PNG);
      } else if (ruta === '/redirige') {
        res.writeHead(302, { location: '/a.png' });
        res.end();
      } else if (ruta === '/a-interno') {
        res.writeHead(301, { location: 'http://interno.prueba/secreto' });
        res.end();
      } else if (ruta === '/bucle') {
        res.writeHead(302, { location: '/bucle' });
        res.end();
      } else if (ruta === '/grande-declarado') {
        res.writeHead(200, { 'content-length': String(11 * 1024 * 1024) });
        res.end();
      } else if (ruta === '/grande-sin-largo') {
        res.writeHead(200, { 'content-type': 'image/png' });
        const trozo = Buffer.alloc(1024 * 1024);
        let n = 0;
        const escribir = () => {
          while (n < 12) {
            n++;
            if (!res.write(trozo)) return res.once('drain', escribir);
          }
          res.end();
        };
        escribir();
      } else if (ruta === '/lento') {
        res.writeHead(200);
        res.write('x');
      } else {
        res.writeHead(404);
        res.end('no');
      }
    });
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    base = `http://foto.prueba:${(servidor.address() as AddressInfo).port}`;
    // Solo en esta prueba: «foto.prueba» es el servidor local, que se acepta como si fuera público.
    o = new ObtenedorSeguro({
      resolver: async (host) => {
        if (host === 'foto.prueba') return [{ address: '127.0.0.1', family: 4 }];
        if (host === 'interno.prueba') return [{ address: '10.0.0.7', family: 4 }];
        throw new Error('ENOTFOUND');
      },
      esPublica: (ip) => ip === '127.0.0.1',
      puertos: 'cualquiera',
      tiempoMs: 1500,
    });
  });
  afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

  it('baja los bytes, siguiendo una redirección', async () => {
    const r = await o.descargar(`${base}/redirige`);
    expect(Buffer.from(r.bytes)).toEqual(PNG);
    expect(r.urlFinal).toBe(`${base}/a.png`);
  });

  it('una redirección hacia una dirección privada se revisa y se corta', async () => {
    await expect(o.descargar(`${base}/a-interno`)).rejects.toThrow('local o privada');
  });

  it('corta los bucles de redirección', async () => {
    await expect(o.descargar(`${base}/bucle`)).rejects.toThrow('demasiadas veces');
  });

  it('dice el código HTTP cuando el aviso ya no está', async () => {
    await expect(o.descargar(`${base}/no-esta.jpg`)).rejects.toThrow('HTTP 404');
  });

  it('no baja más de 10 MB, lo diga el servidor o no', async () => {
    await expect(o.descargar(`${base}/grande-declarado`)).rejects.toThrow('más de 10 MB');
    await expect(o.descargar(`${base}/grande-sin-largo`)).rejects.toThrow('más de 10 MB');
  });

  it('corta una descarga que no termina', async () => {
    await expect(o.descargar(`${base}/lento`)).rejects.toThrow('tardó demasiado');
  });

  it('con las reglas de verdad, el mismo servidor local se rechaza', async () => {
    const real = new ObtenedorSeguro({ puertos: 'cualquiera' });
    const puerto = (servidor.address() as AddressInfo).port;
    await expect(real.descargar(`http://127.0.0.1:${puerto}/a.png`)).rejects.toThrow('local o privada');
    await expect(real.descargar(`http://localhost:${puerto}/a.png`)).rejects.toThrow('local o privada');
  });
});

describe('leer un archivo de tu equipo (F-D9)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brecha-fotos-locales-'));
  const foto = join(dir, 'living.png');
  writeFileSync(foto, PNG);
  mkdirSync(join(dir, 'carpeta.jpg'));
  const o = new ObtenedorSeguro({ maxBytes: 64 });
  writeFileSync(join(dir, 'grande.jpg'), Buffer.alloc(65));

  it('ruta absoluta y file://', async () => {
    expect(await o.leerLocal(foto)).toEqual({ bytes: PNG, nombre: 'living.png' });
    expect((await o.leerLocal(pathToFileURL(foto).toString())).nombre).toBe('living.png');
  });

  it('errores en palabras: no existe, es carpeta, pesa mucho, ruta relativa', async () => {
    await expect(o.leerLocal(join(dir, 'no.png'))).rejects.toThrow('No existe el archivo no.png');
    await expect(o.leerLocal(join(dir, 'carpeta.jpg'))).rejects.toThrow('no es un archivo');
    await expect(o.leerLocal(join(dir, 'grande.jpg'))).rejects.toThrow('más de 10 MB');
    await expect(o.leerLocal('fotos/a.png')).rejects.toThrow('completa');
  });

  it('~/ es la carpeta de la persona', async () => {
    await expect(o.leerLocal('~/no-existe-brecha-123.png')).rejects.toThrow('No existe el archivo');
  });
});
