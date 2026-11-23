// Exporta el contrato OpenAPI a packages/contratos (ADR 0006). No necesita base de datos.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearApp, documentoOpenApi } from './app';

async function main() {
  const app = await crearApp(
    {
      databaseUrl: 'postgresql://x@127.0.0.1:1/x?schema=nucleo',
      puerto: 0,
      host: '127.0.0.1',
      consolaOrigen: 'http://localhost:4200',
      dir: '/tmp',
    },
    { logger: false },
  );
  const doc = documentoOpenApi(app);
  const destino = resolve(__dirname, '../../../packages/contratos/openapi.json');
  writeFileSync(destino, `${JSON.stringify(doc, null, 2)}\n`);
  await app.close();
  console.log(`Contrato escrito en ${destino}`);
}

void main();
