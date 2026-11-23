// Antes de las pruebas: aplica las migraciones en la base desechable de pruebas.
import { execFileSync } from 'node:child_process';
import './vitest.entorno';

export default function setup() {
  const url = process.env.DATABASE_URL_PRUEBAS;
  if (!url)
    throw new Error('Falta DATABASE_URL_PRUEBAS (copia .env.example a .env y levanta docker compose)');
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: __dirname,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
