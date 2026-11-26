import { existsSync } from 'node:fs';
import { request } from 'node:http';
import { join, posix, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';

/**
 * ¿Es una ruta de la API (o del MCP o de la documentación) y no de la consola? Se normaliza como URL (posix):
 * `path.normalize` en Windows cambia `/` por `\\` y entonces ninguna ruta parecía de la API (todo GET devolvía
 * index.html, también `acceso/verificar`, que usa la IA).
 */
export function esDeLaApi(rutaUrl: string): boolean {
  return /^\/(api|mcp|docs)(\/|$)/.test(posix.normalize(rutaUrl));
}

/**
 * Modo app de escritorio (F3): el núcleo sirve la consola compilada y reenvía `/api/ia` al servicio con IA,
 * así la consola, la API y la IA quedan en un solo origen (http://127.0.0.1:4300) sin el proxy de desarrollo.
 * Se registra antes de `listen` para quedar antes de los parsers del cuerpo: el pedido a la IA viaja intacto.
 */
export function montarConsolaYProxyDeIa(
  app: INestApplication,
  opciones: { consolaDir?: string; iaUrl?: string },
): void {
  const http = app.getHttpAdapter().getInstance() as express.Express;
  if (opciones.iaUrl) {
    const destino = new URL(opciones.iaUrl);
    http.use('/api/ia', (req: Request, res: Response) => {
      const pedido = request(
        {
          host: destino.hostname,
          port: destino.port,
          method: req.method,
          path: `/api/ia${req.url}`,
          headers: { ...req.headers, host: `${destino.hostname}:${destino.port}` },
        },
        (respuesta) => {
          res.writeHead(respuesta.statusCode ?? 502, respuesta.headers);
          respuesta.pipe(res);
        },
      );
      pedido.on('error', () => {
        if (!res.headersSent)
          res.status(502).json({ codigo: 'IA_APAGADA', mensaje: 'El servicio con IA no responde' });
      });
      req.pipe(pedido);
    });
  }
  if (opciones.consolaDir) {
    const dir = resolve(opciones.consolaDir);
    http.use(express.static(dir, { index: false, maxAge: '1h' }));
    // Rutas de la consola (Angular): todo GET que no sea de la API vuelve a index.html.
    // Se revisa en cada pedido: si la consola se está recompilando, se avisa en vez de quedar sin montar.
    http.use((req: Request, res: Response, siguiente: NextFunction) => {
      if (req.method !== 'GET' || esDeLaApi(req.path)) return siguiente();
      const indice = join(dir, 'index.html');
      if (!existsSync(indice)) {
        res
          .status(503)
          .type('text/plain')
          .send('La consola no está disponible todavía. Vuelve a intentarlo en un momento.');
        return;
      }
      // Relativo a `root`: con la ruta absoluta, `send` rechaza (404) si alguna carpeta empieza con punto.
      res.sendFile('index.html', { root: dir });
    });
  }
}
