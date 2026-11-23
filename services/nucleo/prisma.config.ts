// Prisma 7 no carga el .env solo: se lee el de la raíz del monorepo si existe (backend.md §5.1).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

const raiz = resolve(import.meta.dirname, '../../.env');
if (existsSync(raiz)) process.loadEnvFile(raiz);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
