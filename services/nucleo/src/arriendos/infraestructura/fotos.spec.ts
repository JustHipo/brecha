import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from '../../compartido/infraestructura/app-de-pruebas.prueba';
import { prismaDePrueba, vaciar } from '../../compartido/infraestructura/base-de-pruebas.prueba';
import { ObtenedorSeguro } from './obtener-imagenes';

/** Una imagen distinta por número (mismo tipo, distinto contenido). */
const png = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, n, n]);
const jpg = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, n]);

const prisma = prismaDePrueba();
let t: AppDePrueba;
let http: ReturnType<typeof request>;
let mcpUrl: URL;
let servidor: Server;
let portal: string;
const auth = (r: request.Test, tipo: 'consola' | 'servicio' = 'consola') =>
  r.set('Authorization', `Bearer ${t.token(tipo)}`);
const carpeta = () => join(t.config.dir, 'fotos');
const archivos = () => (existsSync(carpeta()) ? readdirSync(carpeta()).sort() : []);

beforeAll(async () => {
  // Un «portal» local. Solo aquí se acepta 127.0.0.1 como público; las reglas reales están en obtener-imagenes.spec.
  servidor = createServer((req, res) => {
    const m = /^\/(png|jpg)\/(\d+)$/.exec(req.url ?? '');
    if (m) {
      res.writeHead(200, { 'content-type': 'image/webp' });
      res.end(m[1] === 'png' ? png(Number(m[2])) : jpg(Number(m[2])));
    } else if (req.url === '/html') {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      res.end('<!doctype html><title>Aviso no disponible</title>');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  portal = `http://portal.prueba:${(servidor.address() as AddressInfo).port}`;
  t = await appDePrueba({
    obtenerImagenes: new ObtenedorSeguro({
      resolver: async (h) => (h === 'portal.prueba' ? [{ address: '127.0.0.1', family: 4 }] : []),
      esPublica: (ip) => ip === '127.0.0.1',
      puertos: 'cualquiera',
    }),
  });
  await t.app.listen(0, '127.0.0.1');
  const { port } = t.app.getHttpServer().address() as AddressInfo;
  mcpUrl = new URL(`http://127.0.0.1:${port}/mcp`);
  http = request(t.app.getHttpServer());
});
beforeEach(async () => {
  await vaciar(prisma);
  rmSync(carpeta(), { recursive: true, force: true });
});
afterAll(async () => {
  await t.app.close();
  await prisma.$disconnect();
  await new Promise<void>((r) => servidor.close(() => r()));
});

async function crear(url = 'https://www.portalinmobiliario.com/MLC-77-depto'): Promise<string> {
  const r = await auth(http.post('/api/v1/arriendos/propiedades'))
    .send({ tipo: 'departamento', comuna: 'Ñuñoa', dormitorios: 2, publicacion: { url } })
    .expect(201);
  return r.body.propiedad.id as string;
}

describe('fotos por REST', () => {
  it('agrega por URL, cada una por separado; la primera es la portada y se ve en la lista y en la ficha', async () => {
    const id = await crear();
    const r = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos`))
      .send({
        fuentes: [
          `${portal}/png/1`,
          `${portal}/html`,
          `${portal}/jpg/2`,
          `${portal}/no-esta`,
          'ftp://x/a.jpg',
        ],
      })
      .expect(200);
    expect(r.body.resultados.map((x: { estado: string }) => x.estado)).toEqual([
      'agregada',
      'error',
      'agregada',
      'error',
      'error',
    ]);
    expect(r.body.resultados[1].mensaje).toBe('No es una imagen jpg, png ni webp');
    expect(r.body.resultados[3].mensaje).toContain('HTTP 404');
    expect(r.body.fotos).toHaveLength(2);
    const [primera, segunda] = r.body.fotos;
    expect(primera).toMatchObject({
      orden: 0,
      portada: true,
      tipo: 'image/png',
      origen: 'url',
      urlOrigen: `${portal}/png/1`,
    });
    // El tipo sale de los bytes, no del Content-Type que mandó el servidor (image/webp).
    expect(segunda).toMatchObject({ orden: 1, portada: false, tipo: 'image/jpeg' });
    expect(archivos()).toEqual([`${primera.id}.png`, `${segunda.id}.jpg`].sort());

    const lista = await auth(http.get('/api/v1/arriendos/propiedades')).expect(200);
    expect(lista.body.items[0]).toMatchObject({ portada: primera.id, cantidadFotos: 2 });
    const ficha = await auth(http.get(`/api/v1/arriendos/propiedades/${id}`)).expect(200);
    expect(ficha.body.fotos.map((f: { id: string }) => f.id)).toEqual([primera.id, segunda.id]);

    // La misma imagen otra vez (otra URL, mismo contenido): no se repite.
    const otra = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos`))
      .send({ fuentes: [`${portal}/png/1`] })
      .expect(200);
    expect(otra.body.resultados[0]).toMatchObject({ estado: 'ya_estaba', foto: { id: primera.id } });
    expect(archivos()).toHaveLength(2);
  });

  it('sirve la imagen con su tipo, solo con token', async () => {
    const id = await crear();
    const r = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos`))
      .send({ fuentes: [`${portal}/jpg/9`] })
      .expect(200);
    const fotoId = r.body.fotos[0].id;
    const img = await auth(http.get(`/api/v1/arriendos/fotos/${fotoId}`))
      .buffer(true)
      .expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(img.body)).toEqual(jpg(9));
    await http.get(`/api/v1/arriendos/fotos/${fotoId}`).expect(401);
    await auth(http.get('/api/v1/arriendos/fotos/00000000-0000-0000-0000-000000000000')).expect(404);
    await auth(http.get('/api/v1/arriendos/fotos/..%2F..%2Ftoken-consola')).expect(404);
  });

  it('elegir portada la pasa al frente; quitar borra el archivo y deja el orden sin huecos', async () => {
    const id = await crear();
    const r = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos`))
      .send({ fuentes: [1, 2, 3].map((n) => `${portal}/png/${n}`) })
      .expect(200);
    const [a, b, c] = r.body.fotos.map((f: { id: string }) => f.id);
    const p = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos/${c}/portada`)).expect(200);
    expect(p.body.map((f: { id: string }) => f.id)).toEqual([c, a, b]);
    expect(p.body[0].portada).toBe(true);

    const q = await auth(http.delete(`/api/v1/arriendos/propiedades/${id}/fotos/${c}`)).expect(200);
    expect(q.body.map((f: { id: string; orden: number }) => [f.id, f.orden])).toEqual([
      [a, 0],
      [b, 1],
    ]);
    expect(archivos().some((x) => x.startsWith(c))).toBe(false);
    await auth(http.delete(`/api/v1/arriendos/propiedades/${id}/fotos/${c}`)).expect(404);

    // Una foto de otra propiedad no se toca desde esta.
    const otra = await crear('https://www.yapo.cl/arriendo/1');
    await auth(http.post(`/api/v1/arriendos/propiedades/${otra}/fotos/${a}/portada`)).expect(404);
  });

  it('agrega la portada elegida en la misma llamada y valida la lista', async () => {
    const id = await crear();
    const r = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos`))
      .send({ fuentes: [`${portal}/png/1`, `${portal}/png/2`], portada: 1 })
      .expect(200);
    expect(r.body.fotos[0].urlOrigen).toBe(`${portal}/png/2`);
    await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos`))
      .send({ fuentes: [] })
      .expect(400);
    await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos`))
      .send({ fuentes: Array.from({ length: 21 }, (_, i) => `${portal}/png/${i}`) })
      .expect(400);
    await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos`))
      .send({ fuentes: [`${portal}/png/1`], portada: 3 })
      .expect(400);
    await auth(http.post('/api/v1/arriendos/propiedades/00000000-0000-0000-0000-000000000000/fotos'))
      .send({ fuentes: [`${portal}/png/1`] })
      .expect(404);
  });

  it('desde un archivo de este equipo (ruta) y subido por la consola (cuerpo)', async () => {
    const id = await crear();
    const dir = mkdtempSync(join(tmpdir(), 'brecha-fotos-'));
    writeFileSync(join(dir, 'living.png'), png(40));
    const r = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos`))
      .send({ fuentes: [join(dir, 'living.png')] })
      .expect(200);
    expect(r.body.fotos[0]).toMatchObject({ origen: 'archivo', nombreOrigen: 'living.png', urlOrigen: null });

    const s = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos/archivo`))
      .set('Content-Type', 'image/jpeg')
      .set('X-Nombre-Archivo', encodeURIComponent('dormitorio ñ.jpg'))
      .send(jpg(41))
      .expect(201);
    expect(s.body).toMatchObject({ yaEstaba: false, foto: { orden: 1, nombreOrigen: 'dormitorio ñ.jpg' } });
    const otra = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos/archivo`))
      .set('Content-Type', 'application/octet-stream')
      .send(jpg(41))
      .expect(201);
    expect(otra.body.yaEstaba).toBe(true);

    const html = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos/archivo`))
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<html></html>'))
      .expect(400);
    expect(html.body.codigo).toBe('VALIDACION');
    const grande = await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos/archivo`))
      .set('Content-Type', 'image/png')
      .send(Buffer.concat([png(1), Buffer.alloc(10 * 1024 * 1024)]))
      .expect(400);
    expect(grande.body.mensaje).toBe('La imagen pesa más de 10 MB');
    await auth(http.post(`/api/v1/arriendos/propiedades/${id}/fotos/archivo`))
      .set('Content-Type', 'application/json')
      .send({ hola: 1 })
      .expect(400);
  });

  it('unir pasa las fotos a la que queda sin repetir; borrar la propiedad borra sus archivos', async () => {
    const a = await crear();
    const b = await crear('https://www.yapo.cl/arriendo/2');
    await auth(http.post(`/api/v1/arriendos/propiedades/${a}/fotos`))
      .send({ fuentes: [`${portal}/png/1`, `${portal}/png/2`] })
      .expect(200);
    await auth(http.post(`/api/v1/arriendos/propiedades/${b}/fotos`))
      .send({ fuentes: [`${portal}/png/2`, `${portal}/png/3`] })
      .expect(200);
    expect(archivos()).toHaveLength(4);
    const u = await auth(http.post(`/api/v1/arriendos/propiedades/${a}/unir`))
      .send({ origenId: b })
      .expect(200);
    expect(u.body.fotos.map((f: { urlOrigen: string; orden: number }) => [f.urlOrigen, f.orden])).toEqual([
      [`${portal}/png/1`, 0],
      [`${portal}/png/2`, 1],
      [`${portal}/png/3`, 2],
    ]);
    expect(archivos()).toHaveLength(3);

    await auth(http.delete(`/api/v1/arriendos/propiedades/${a}`)).expect(204);
    expect(archivos()).toEqual([]);
    expect(await prisma.fotoPropiedad.count()).toBe(0);
  });
});

describe('fotos por MCP', () => {
  async function cliente(): Promise<Client> {
    const c = new Client({ name: 'prueba', version: '1.0.0' });
    await c.connect(
      new StreamableHTTPClientTransport(mcpUrl, {
        requestInit: { headers: { Authorization: `Bearer ${t.token('mcp')}` } },
      }),
    );
    return c;
  }
  const texto = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;

  it('crear_propiedad con fotos, agregar_fotos, listar_fotos, elegir_portada y quitar_foto', async () => {
    const c = await cliente();
    const creada = await c.callTool({
      name: 'crear_propiedad',
      arguments: {
        tipo: 'departamento',
        comuna: 'Providencia',
        publicacion: { url: 'https://www.portalinmobiliario.com/MLC-88-depto' },
        fotos: [`${portal}/png/1`, `${portal}/png/2`],
      },
    });
    expect(creada.isError).toBeFalsy();
    expect(texto(creada)).toContain('2 fotos');
    expect(texto(creada)).toContain('Fotos: 2 agregadas, 0 ya estaban, 0 con error');
    const id = /id ([0-9a-f-]{36})\n/.exec(texto(creada))![1]!;

    const mas = await c.callTool({
      name: 'agregar_fotos',
      arguments: { id, fotos: [`${portal}/png/3`, `${portal}/html`] },
    });
    expect(mas.isError).toBeFalsy();
    expect(texto(mas)).toContain('1 agregadas, 0 ya estaban, 1 con error');
    expect(texto(mas)).toContain('No es una imagen');

    const todasMal = await c.callTool({ name: 'agregar_fotos', arguments: { id, fotos: [`${portal}/no`] } });
    expect(todasMal.isError).toBe(true);

    const lista = texto(await c.callTool({ name: 'listar_fotos', arguments: { id } }));
    expect(lista).toMatch(/^3 fotos\n1\. portada · id /);
    const ids = [...lista.matchAll(/id ([0-9a-f-]{36})/g)].map((m) => m[1]!);
    const portada = texto(await c.callTool({ name: 'elegir_portada', arguments: { id, fotoId: ids[2]! } }));
    expect(portada).toContain(`1. portada · id ${ids[2]}`);
    const quitada = texto(await c.callTool({ name: 'quitar_foto', arguments: { id, fotoId: ids[2]! } }));
    expect(quitada).toContain('Quedan 2');
    expect(quitada).toContain(`1. portada · id ${ids[0]}`);

    const listar = texto(await c.callTool({ name: 'listar_propiedades', arguments: {} }));
    expect(listar).toContain('2 fotos');
    const mal = await c.callTool({ name: 'quitar_foto', arguments: { id, fotoId: ids[2]! } });
    expect(mal.isError).toBe(true);
    expect(texto(mal)).toContain('NO_ENCONTRADO');
    await c.close();
  });
});
