import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/** Configuración del núcleo, cargada y validada antes de usarla (backend.md §6, NESTJS-ARGOS-04). */
export interface Config {
  databaseUrl: string;
  puerto: number;
  host: '127.0.0.1';
  consolaOrigen: string;
  /** Carpeta de la instancia: tokens y configuración local. */
  dir: string;
}

const RAIZ = resolve(__dirname, '../../../../..');

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const archivo = resolve(RAIZ, '.env');
  if (env === process.env && existsSync(archivo)) process.loadEnvFile(archivo);
  const faltan = ['DATABASE_URL'].filter((k) => !env[k]);
  if (faltan.length) throw new Error(`Faltan variables de entorno: ${faltan.join(', ')} (ver .env.example)`);
  const puerto = Number(env.NUCLEO_PUERTO ?? 4300);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535)
    throw new Error('NUCLEO_PUERTO no es un puerto válido');
  const dir = env.BRECHA_DIR ?? '.brecha';
  return {
    databaseUrl: env.DATABASE_URL!,
    puerto,
    host: '127.0.0.1',
    consolaOrigen: env.CONSOLA_ORIGEN ?? 'http://localhost:4200',
    dir: isAbsolute(dir) ? dir : resolve(RAIZ, dir),
  };
}
