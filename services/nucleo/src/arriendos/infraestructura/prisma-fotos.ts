import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../compartido/infraestructura/prisma';
import type { Foto, FotoRepositorio } from '../aplicacion/puertos';
import type { Oyente } from './prisma-arriendos';

type Fila = NonNullable<Awaited<ReturnType<PrismaClient['fotoPropiedad']['findUnique']>>>;

const aFoto = (f: Fila): Foto => ({ ...f, origen: f.origen as Foto['origen'] });

const UUID = /^[0-9a-f-]{36}$/i;

/** Tabla `foto_propiedad` (docs/diseno/fotos-propiedades.md F-D1). */
export class PrismaFotos implements FotoRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async dePropiedad(propiedadId: string): Promise<Foto[]> {
    if (!UUID.test(propiedadId)) return [];
    const filas = await this.prisma.fotoPropiedad.findMany({
      where: { propiedadId },
      orderBy: [{ orden: 'asc' }, { creadaEn: 'asc' }],
    });
    return filas.map(aFoto);
  }

  async todas(): Promise<Foto[]> {
    const filas = await this.prisma.fotoPropiedad.findMany({
      orderBy: [{ propiedadId: 'asc' }, { orden: 'asc' }, { creadaEn: 'asc' }],
    });
    return filas.map(aFoto);
  }

  async porId(id: string): Promise<Foto | null> {
    if (!UUID.test(id)) return null;
    const f = await this.prisma.fotoPropiedad.findUnique({ where: { id } });
    return f ? aFoto(f) : null;
  }

  async porHuella(propiedadId: string, sha256: string): Promise<Foto | null> {
    const f = await this.prisma.fotoPropiedad.findUnique({
      where: { propiedadId_sha256: { propiedadId, sha256 } },
    });
    return f ? aFoto(f) : null;
  }

  async crear(f: Foto): Promise<void> {
    await this.prisma.fotoPropiedad.create({ data: f });
  }

  async actualizar(cambios: { id: string; orden: number; propiedadId?: string }[]): Promise<void> {
    if (!cambios.length) return;
    await this.prisma.$transaction(
      cambios.map(({ id, orden, propiedadId }) =>
        this.prisma.fotoPropiedad.update({
          where: { id },
          data: { orden, ...(propiedadId ? { propiedadId } : {}) },
        }),
      ),
    );
  }

  async borrar(id: string): Promise<void> {
    await this.prisma.fotoPropiedad.deleteMany({ where: { id } });
  }
}

/** Aviso en vivo de que cambiaron las fotos: la consola recarga la ficha y el tablero. */
export function avisoDeFotos(oyente: Oyente): (propiedadId: string) => void {
  return (propiedadId) =>
    oyente.publicar([
      {
        id: randomUUID(),
        tipo: 'propiedad.actualizada',
        version: 1,
        ocurridoEn: new Date().toISOString(),
        prioridad: 'baja',
        correlacionId: null,
        datos: { propiedadId, fotos: true },
      },
    ]);
}
