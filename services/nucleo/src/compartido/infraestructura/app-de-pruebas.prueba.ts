import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { crearApp } from '../../app';
import type { Config } from './config';

export interface AppDePrueba {
  app: INestApplication;
  config: Config;
  token: (tipo: 'consola' | 'mcp' | 'servicio') => string;
}

/** Levanta el núcleo completo contra la base de pruebas, con una carpeta de instancia temporal. */
export async function appDePrueba(
  opciones: { antesDeIniciar?: (app: INestApplication) => void } = {},
): Promise<AppDePrueba> {
  const url = process.env.DATABASE_URL_PRUEBAS;
  if (!url) throw new Error('Falta DATABASE_URL_PRUEBAS');
  const config: Config = {
    databaseUrl: url,
    puerto: 0,
    host: '127.0.0.1',
    consolaOrigen: 'http://localhost:4200',
    dir: mkdtempSync(join(tmpdir(), 'brecha-')),
  };
  const app = await crearApp(config, { logger: false });
  opciones.antesDeIniciar?.(app);
  await app.init();
  return { app, config, token: (tipo) => readFileSync(join(config.dir, `token-${tipo}`), 'utf8').trim() };
}
