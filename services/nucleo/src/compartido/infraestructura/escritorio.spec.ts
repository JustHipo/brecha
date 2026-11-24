import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from './app-de-pruebas.prueba';
import { montarConsolaYProxyDeIa } from './escritorio';

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

describe('modo app de escritorio', () => {
  it('sirve la consola y sus rutas, sin tapar la API', async () => {
    expect((await http.get('/main.js').expect(200)).text).toContain('console.log');
    expect((await http.get('/postulaciones/abc').expect(200)).text).toContain('<title>Brecha</title>');
    await http.get('/api/v1/postulaciones').expect(401);
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
