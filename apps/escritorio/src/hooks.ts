import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Registro } from './registro';

/**
 * Hooks (PLAN §12.4): `hooks.json` en la carpeta de la instancia. Por tipo de evento (o `*`), un comando local
 * que recibe el evento en JSON por la entrada estándar, o una URL local que lo recibe por POST.
 *
 * {
 *   "postulacion.entrevista_agendada": [{ "comando": "/usr/local/bin/agendar.sh" }],
 *   "*": [{ "url": "http://127.0.0.1:5678/brecha" }]
 * }
 */
export interface Hook {
  comando?: string;
  url?: string;
}

export type Hooks = Record<string, Hook[]>;

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
const TIEMPO_MAXIMO_MS = 30_000;

export function leerHooks(instancia: string, registro: Registro): Hooks {
  const ruta = join(instancia, 'hooks.json');
  if (!existsSync(ruta)) return {};
  try {
    const crudo = JSON.parse(readFileSync(ruta, 'utf8')) as unknown;
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo))
      throw new Error('tiene que ser un objeto');
    return crudo as Hooks;
  } catch (e) {
    registro.escribir('hooks', `hooks.json no es válido: ${(e as Error).message}`);
    return {};
  }
}

/** Los hooks que corresponden a un evento: los de su tipo y los de `*`. Las URL que no son locales se ignoran. */
export function hooksPara(hooks: Hooks, tipo: string): Hook[] {
  return [...(hooks[tipo] ?? []), ...(hooks['*'] ?? [])].filter(
    (h) => (h.comando && typeof h.comando === 'string') || (h.url && LOCAL.test(h.url)),
  );
}

export async function ejecutarHook(h: Hook, evento: unknown, registro: Registro): Promise<void> {
  const json = JSON.stringify(evento);
  if (h.url) {
    try {
      const r = await fetch(h.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      });
      registro.escribir('hooks', `${h.url} respondió ${r.status}`);
    } catch (e) {
      registro.escribir('hooks', `${h.url} falló: ${(e as Error).message}`);
    }
    return;
  }
  if (!h.comando) return;
  await new Promise<void>((listo) => {
    const hijo = spawn('/bin/sh', ['-c', h.comando!], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: TIEMPO_MAXIMO_MS,
    });
    hijo.stdout.on('data', (b: Buffer) => registro.escribir('hooks', b.toString()));
    hijo.stderr.on('data', (b: Buffer) => registro.escribir('hooks', b.toString()));
    hijo.on('error', (e) => {
      registro.escribir('hooks', `${h.comando} no se pudo lanzar: ${e.message}`);
      listo();
    });
    hijo.on('exit', (codigo) => {
      registro.escribir('hooks', `${h.comando} terminó con código ${codigo}`);
      listo();
    });
    hijo.stdin.end(json);
  });
}
