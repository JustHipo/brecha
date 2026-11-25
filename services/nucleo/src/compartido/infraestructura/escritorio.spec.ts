import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from './app-de-pruebas.prueba';
import { esDeLaApi, montarConsolaYProxyDeIa } from './escritorio';

let t: AppDePrueba;
let ia: Server;
let http: ReturnType<typeof request>;
const recibidos: { url?: string; body: string; auth?: string }[] = [];

beforeAll(async () => {
  ia = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      recibidos.push({
        ...(req.url ? { url: req.url } : {}),
        body,
        ...(req.headers.authorization ? { auth: req.headers.authorization } : {}),
      });
      res.writeHead(201, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
  });
  await new Promise<void>((r) => ia.listen(0, '127.0.0.1', r));
  // Dentro de una carpeta que empieza con punto (como .claude/worktrees): antes daba 404 en las rutas de la consola.
  const consola = join(mkdtempSync(join(tmpdir(), 'consola-')), '.oculta');
  mkdirSync(consola);
  writeFileSync(join(consola, 'index.html'), '<!doctype html><title>Brecha</title>');
  writeFileSync(join(consola, 'main.js'), 'console.log(1)');
  t = await appDePrueba({
    antesDeIniciar: (app) =>
      montarConsolaYProxyDeIa(app, {
        consolaDir: consola,
        iaUrl: `http://127.0.0.1:${(ia.address() as AddressInfo).port}`,
      }),
  });
  http = request(t.app.getHttpServer());
});
afterAll(async () => {
  await t.app.close();
  ia.close();
});

describe('rutas de la API frente a las de la consola', () => {
  it('reconoce la API, el MCP y la documentación sin importar el sistema', () => {
    for (const r of [
      '/api/v1/postulaciones/tablero',
      '/api',
      '/mcp',
      '/docs/',
      '/x/../api/v1/salud',
      '//api/v1',
      // Las fotos de las propiedades se sirven desde la API, nunca como página de la consola (fotos-propiedades.md §7).
      '/api/v1/arriendos/fotos/0190a3c2-7b1e-7c3a-9f00-123456789abc',
    ])
      expect(esDeLaApi(r), r).toBe(true);
    for (const r of ['/tablero', '/postulaciones/1', '/apis', '/', '/ajustes', '/arriendos/propiedades/1'])
      expect(esDeLaApi(r), r).toBe(false);
  });
});

describe('modo app de escritorio', () => {
  it('sirve la consola y sus rutas, sin tapar la API', async () => {
    expect((await http.get('/main.js').expect(200)).text).toContain('console.log');
    expect((await http.get('/postulaciones/abc').expect(200)).text).toContain('<title>Brecha</title>');
    await http.get('/api/v1/postulaciones').expect(401);
    // Una foto sin token: la API responde (401), no el index.html de la consola.
    const foto = await http.get('/api/v1/arriendos/fotos/0190a3c2-7b1e-7c3a-9f00-123456789abc').expect(401);
    expect(foto.text).not.toContain('<title>');
  });

  it('reenvía /api/ia con el cuerpo y el token intactos', async () => {
    await http
      .post('/api/ia/preguntas?x=1')
      .set('Authorization', 'Bearer tok')
      .send({ pregunta: '¿hola?' })
      .expect(201);
    expect(recibidos.at(-1)).toEqual({
      url: '/api/ia/preguntas?x=1',
      body: '{"pregunta":"¿hola?"}',
      auth: 'Bearer tok',
    });
  });
});
