// F1-11: `pnpm --filter nucleo importar <archivo>` importa el export del artifact (por defecto datos/privado/artifact-export.json).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarConfig } from '../../../compartido/infraestructura/config';
import { crearPrisma } from '../../../compartido/infraestructura/prisma';
import { GeneradorUuidV7, RelojDelSistema } from '../../../compartido/infraestructura/reloj-y-ids';
import { ImportarFichas } from '../../aplicacion/importar-fichas';
import { PrismaAjustes } from '../prisma/prisma-ajustes';
import { PrismaBandeja } from '../prisma/prisma-bandeja';
import { PrismaConsultas } from '../prisma/prisma-consultas';
import { PrismaPostulacionRepositorio } from '../prisma/prisma-postulacion.repositorio';
import { fichasDesdeArtifact } from './desde-artifact';

async function main() {
  const raiz = resolve(__dirname, '../../../../../..');
  const archivo = resolve(
    process.env.INIT_CWD ?? raiz,
    process.argv[2] ?? resolve(raiz, 'datos/privado/artifact-export.json'),
  );
  const config = cargarConfig();
  const prisma = crearPrisma(config.databaseUrl);
  const reloj = new RelojDelSistema();
  const ids = new GeneradorUuidV7();
  const caso = new ImportarFichas({
    repo: new PrismaPostulacionRepositorio(prisma, ids),
    bandeja: new PrismaBandeja(prisma, ids),
    consultas: new PrismaConsultas(prisma, reloj),
    reloj,
    ids,
    ajustes: new PrismaAjustes(prisma),
  });
  const fichas = fichasDesdeArtifact(JSON.parse(readFileSync(archivo, 'utf8')));
  const r = await caso.ejecutar(fichas);
  console.log(
    `Importación de ${archivo}: ${r.creadas} creadas, ${r.omitidas} omitidas (ya existían), ${r.errores.length} con error.`,
  );
  for (const e of r.errores) console.log(`  ${e.codigo} ${e.campo ?? ''} ${e.url}: ${e.mensaje}`);
  console.log(`Total en la base: ${await prisma.postulacion.count()}`);
  await prisma.$disconnect();
  if (r.errores.length) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
