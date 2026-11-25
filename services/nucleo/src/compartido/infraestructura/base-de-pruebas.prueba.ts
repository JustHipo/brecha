import { crearPrisma, type PrismaClient } from './prisma';

export function prismaDePrueba(): PrismaClient {
  const url = process.env.DATABASE_URL_PRUEBAS;
  if (!url) throw new Error('Falta DATABASE_URL_PRUEBAS');
  return crearPrisma(url);
}

/** Deja vacías las tablas del esquema `nucleo` (no toca `_prisma_migrations`). */
export async function vaciar(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE postulacion, cambio_estado, senal, senal_pendiente, discrepancia, entrevista, contacto, nota, acceso, ajuste, outbox, contacto_red, paso, paso_postulacion, propiedad, canal_arriendo, busqueda_arriendo, senal_arriendo_pendiente, geocodificacion, perfil_empleo, foto_propiedad CASCADE',
  );
}
