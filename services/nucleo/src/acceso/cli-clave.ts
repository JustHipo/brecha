// Configura o quita la clave local: `pnpm --filter nucleo clave` (pide la clave) o `-- --quitar`.
import { createInterface } from 'node:readline/promises';
import { cargarConfig } from '../compartido/infraestructura/config';
import { crearPrisma } from '../compartido/infraestructura/prisma';
import { AccesoService } from './acceso.service';
import { AlmacenDeTokens } from './almacen-de-tokens';

async function main() {
  const config = cargarConfig();
  const prisma = crearPrisma(config.databaseUrl);
  const acceso = new AccesoService(prisma, new AlmacenDeTokens(config.dir));
  await acceso.iniciar();
  if (process.argv.includes('--quitar')) {
    await acceso.fijarClave(null);
    console.log('Clave local quitada. Reinicia el núcleo.');
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const clave = (await rl.question('Clave nueva (mínimo 8 caracteres): ')).trim();
    rl.close();
    if (clave.length < 8) throw new Error('La clave debe tener al menos 8 caracteres');
    await acceso.fijarClave(clave);
    console.log('Clave local configurada. Reinicia el núcleo.');
  }
  await prisma.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
