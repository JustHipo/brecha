import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';

/** Deja la base de pruebas migrada y vacía antes del flujo. */
export default async function preparar(): Promise<void> {
  const url = process.env.DATABASE_URL_PRUEBAS!;
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '../../../services/nucleo'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  const cliente = new pg.Client({ connectionString: url.split('?')[0] });
  await cliente.connect();
  await cliente.query('SET search_path TO nucleo');
  await cliente.query(
    'TRUNCATE postulacion, cambio_estado, senal, discrepancia, entrevista, contacto, nota, acceso, ajuste, outbox CASCADE',
  );
  await cliente.end();
}
