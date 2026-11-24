import { join, resolve } from 'node:path';

/** Dónde está cada pieza: dentro del .app (empaquetada) o en el repo (desarrollo, `pnpm --filter escritorio dev`). */
export interface Rutas {
  postgres: string;
  nucleo: string;
  consola: string;
  ia: string;
}

export function rutas(empaquetada: boolean, recursos: string): Rutas {
  if (empaquetada) {
    return {
      postgres: join(recursos, 'postgres'),
      nucleo: join(recursos, 'nucleo'),
      consola: join(recursos, 'consola'),
      ia: join(recursos, 'ia', 'brecha-ia'),
    };
  }
  const repo = resolve(__dirname, '..', '..', '..');
  return {
    postgres: join(repo, 'apps', 'escritorio', 'recursos', 'postgres'),
    nucleo: join(repo, 'services', 'nucleo'),
    consola: join(repo, 'apps', 'consola', 'dist', 'consola', 'browser'),
    ia: join(repo, 'services', 'ia', 'dist', 'brecha-ia', 'brecha-ia'),
  };
}

/**
 * Puertos fijos: la consola, el MCP de tu IA y el vigía los conocen. PostgreSQL usa 5434 para no chocar con Docker.
 * BRECHA_PUERTOS=«pg,núcleo,ia» los cambia (solo para probar la app al lado del entorno de desarrollo).
 */
export function puertos(env: NodeJS.ProcessEnv = process.env): {
  postgres: number;
  nucleo: number;
  ia: number;
} {
  const [postgres, nucleo, ia] = (env.BRECHA_PUERTOS ?? '').split(',').map(Number);
  return postgres && nucleo && ia ? { postgres, nucleo, ia } : { postgres: 5434, nucleo: 4300, ia: 4400 };
}

export const PUERTOS = puertos();
