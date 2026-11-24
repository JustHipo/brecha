// `pnpm --filter nucleo importar <archivo>`: un .json es el export del artifact (F1-11, por defecto
// datos/privado/artifact-export.json); un .csv es una planilla de postulaciones o de contactos (docs/diseno/csv.md),
// reconocida por su encabezado. Importa primero las postulaciones y después los contactos.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarConfig } from '../../../compartido/infraestructura/config';
import { crearPrisma } from '../../../compartido/infraestructura/prisma';
import { GeneradorUuidV7, RelojDelSistema } from '../../../compartido/infraestructura/reloj-y-ids';
import { CasosCsv } from '../../../csv/aplicacion/casos-csv';
import { LectorCsvParse } from '../../../csv/infraestructura/lector-csv';
import { CasosDeRed } from '../../../red/aplicacion/casos-de-red';
import { PrismaRed } from '../../../red/infraestructura/prisma-red';
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
  const repo = new PrismaPostulacionRepositorio(prisma, ids);
  const consultas = new PrismaConsultas(prisma, reloj);
  const fichas = new ImportarFichas({
    repo,
    bandeja: new PrismaBandeja(prisma, ids),
    consultas,
    reloj,
    ids,
    ajustes: new PrismaAjustes(prisma),
  });
  const texto = readFileSync(archivo, 'utf8');

  if (archivo.toLowerCase().endsWith('.csv')) {
    const red = new PrismaRed(prisma);
    const casosRed = new CasosDeRed({
      red,
      reloj,
      ids,
      existePostulacion: async (id) => (await prisma.postulacion.count({ where: { id } })) > 0,
    });
    const csv = new CasosCsv({
      lector: new LectorCsvParse(),
      reloj,
      fichas,
      registrarContacto: casosRed.registrarContacto,
      red,
      consultas,
      idPorUrl: (url) => repo.idPorUrl(url.trim()),
    });
    const r = await csv.importar.ejecutar({ csv: texto });
    console.log(
      `Importación de ${archivo} (${r.tipo}): ${r.creadas} creadas, ${r.yaEstaban} ya estaban, ${r.actualizadas} actualizadas, ` +
        `${r.errores} con error, ${r.conAdvertencias} con advertencia.`,
    );
    for (const a of r.advertencias) console.log(`  ${a}`);
    for (const f of r.filas) {
      if (f.resultado === 'error') console.log(`  línea ${f.fila} ERROR ${f.campo ?? ''}: ${f.mensaje}`);
      for (const a of f.advertencias) console.log(`  línea ${f.fila} advertencia: ${a}`);
    }
    await prisma.$disconnect();
    if (r.errores) process.exitCode = 1;
    return;
  }

  const r = await fichas.ejecutar(fichasDesdeArtifact(JSON.parse(texto)));
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
