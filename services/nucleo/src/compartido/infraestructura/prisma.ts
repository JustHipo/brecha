import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generado/prisma/client';

export type { PrismaClient };
export { Prisma } from '../../generado/prisma/client';

/** Cliente de Prisma 7 con driver adapter sobre el esquema `nucleo` (backend.md §5.1). */
export function crearPrisma(url: string): PrismaClient {
  const esquema = new URL(url).searchParams.get('schema') ?? 'nucleo';
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }, { schema: esquema }) });
}

/** Indica si un error de Prisma es una violación de unicidad sobre la columna dada. */
export function esUnicoViolado(error: unknown, columna: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: string; meta?: unknown; message?: string };
  if (e.code !== 'P2002') return false;
  const texto = JSON.stringify(e.meta ?? {}) + (e.message ?? '');
  const camel = columna.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
  return texto.includes(columna) || texto.includes(camel);
}
