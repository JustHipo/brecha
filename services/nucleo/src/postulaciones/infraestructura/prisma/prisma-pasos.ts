import type { GeneradorId } from '../../../compartido/dominio/puertos';
import { esUnicoViolado, Prisma, type PrismaClient } from '../../../compartido/infraestructura/prisma';
import { ConflictoDeVersion, DatoInvalido } from '../../dominio/errores';
import {
  Paso,
  type CerradorDePaso,
  type DatosPaso,
  type EstadoDePaso,
  type FuenteDePaso,
  type PasoRepositorio,
  type RegistradorDePaso,
  type SugerenciaDeCierre,
} from '../../dominio/paso';
import { aEventosGuardados, aFilasOutbox, type OyenteDeEventos } from '../outbox/outbox';
import { aFecha, deFecha } from './mapper';

const UUID = /^[0-9a-f-]{36}$/i;

export const INCLUIR_PASO = { postulaciones: { select: { postulacionId: true } } } as const;
type FilaPaso = Prisma.PasoGetPayload<{ include: typeof INCLUIR_PASO }>;

export function filaAPaso(f: FilaPaso): DatosPaso {
  const sugerencia = f.sugerenciaCierre as {
    referenciaExterna?: string;
    confianza: number;
    en: string;
  } | null;
  return {
    id: f.id,
    postulacionIds: f.postulaciones.map((x) => x.postulacionId).sort(),
    descripcion: f.descripcion,
    ...(f.detalle ? { detalle: f.detalle } : {}),
    ...(f.plazo ? { plazo: aFecha(f.plazo) } : {}),
    ...(f.enlace ? { enlace: f.enlace } : {}),
    estado: f.estado as EstadoDePaso,
    fuente: f.fuente as FuenteDePaso,
    registradoPor: f.registradoPor as RegistradorDePaso,
    ...(f.contactoRedId ? { contactoRedId: f.contactoRedId } : {}),
    ...(f.referenciaExterna ? { referenciaExterna: f.referenciaExterna } : {}),
    ...(f.cerradoPor && f.cerradoEn
      ? {
          cierre: {
            por: f.cerradoPor as CerradorDePaso,
            en: f.cerradoEn,
            ...(f.notaCierre ? { nota: f.notaCierre } : {}),
            ...(f.referenciaCierre ? { referenciaExterna: f.referenciaCierre } : {}),
          },
        }
      : {}),
    ...(sugerencia
      ? {
          sugerenciaCierre: {
            ...(sugerencia.referenciaExterna ? { referenciaExterna: sugerencia.referenciaExterna } : {}),
            confianza: sugerencia.confianza,
            en: new Date(sugerencia.en),
          } satisfies SugerenciaDeCierre,
        }
      : {}),
    pedidoEn: f.pedidoEn,
    creadoEn: f.creadoEn,
    actualizadoEn: f.actualizadoEn,
    version: f.version,
  };
}

function aFila(d: DatosPaso) {
  return {
    descripcion: d.descripcion,
    detalle: d.detalle ?? null,
    plazo: d.plazo ? deFecha(d.plazo) : null,
    enlace: d.enlace ?? null,
    estado: d.estado,
    fuente: d.fuente,
    registradoPor: d.registradoPor,
    contactoRedId: d.contactoRedId ?? null,
    referenciaExterna: d.referenciaExterna ?? null,
    cerradoPor: d.cierre?.por ?? null,
    cerradoEn: d.cierre?.en ?? null,
    notaCierre: d.cierre?.nota ?? null,
    referenciaCierre: d.cierre?.referenciaExterna ?? null,
    sugerenciaCierre: d.sugerenciaCierre
      ? {
          ...(d.sugerenciaCierre.referenciaExterna
            ? { referenciaExterna: d.sugerenciaCierre.referenciaExterna }
            : {}),
          confianza: d.sugerenciaCierre.confianza,
          en: d.sugerenciaCierre.en.toISOString(),
        }
      : Prisma.DbNull,
    pedidoEn: d.pedidoEn,
    actualizadoEn: d.actualizadoEn,
  };
}

/** Adaptador de salida de los pasos: el paso, sus postulaciones y sus eventos en una transacción. */
export class PrismaPasos implements PasoRepositorio {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ids: GeneradorId,
    private readonly oyente?: OyenteDeEventos,
  ) {}

  async porId(id: string): Promise<Paso | null> {
    if (!UUID.test(id)) return null;
    const f = await this.prisma.paso.findUnique({ where: { id }, include: INCLUIR_PASO });
    return f ? Paso.reconstituir(filaAPaso(f)) : null;
  }

  async porReferencia(referenciaExterna: string): Promise<Paso | null> {
    const f = await this.prisma.paso.findUnique({ where: { referenciaExterna }, include: INCLUIR_PASO });
    return f ? Paso.reconstituir(filaAPaso(f)) : null;
  }

  async deLasPostulaciones(ids: readonly string[]): Promise<Paso[]> {
    const validos = ids.filter((x) => UUID.test(x));
    if (!validos.length) return [];
    const filas = await this.prisma.paso.findMany({
      where: { postulaciones: { some: { postulacionId: { in: validos } } } },
      include: INCLUIR_PASO,
      orderBy: [{ pedidoEn: 'asc' }, { id: 'asc' }],
    });
    return filas.map((f) => Paso.reconstituir(filaAPaso(f)));
  }

  async estadosDePostulaciones(ids: readonly string[]): Promise<Map<string, string>> {
    const validos = ids.filter((x) => UUID.test(x));
    if (!validos.length) return new Map();
    const filas = await this.prisma.postulacion.findMany({
      where: { id: { in: validos } },
      select: { id: true, estado: true },
    });
    return new Map(filas.map((f) => [f.id, f.estado]));
  }

  async guardar(paso: Paso): Promise<void> {
    const d = paso.datos();
    const creado = paso.creado;
    const eventos = aEventosGuardados(paso.sacarEventos(), this.ids, null);
    const fila = aFila(d);
    try {
      await this.prisma.$transaction(async (tx) => {
        if (creado) {
          await tx.paso.create({
            data: { id: d.id, ...fila, version: 0, creadoEn: d.creadoEn },
          });
        } else {
          const r = await tx.paso.updateMany({
            where: { id: d.id, version: d.version },
            data: { ...fila, version: { increment: 1 } },
          });
          if (r.count === 0) throw new ConflictoDeVersion();
          await tx.pasoPostulacion.deleteMany({
            where: { pasoId: d.id, postulacionId: { notIn: d.postulacionIds } },
          });
        }
        await tx.pasoPostulacion.createMany({
          data: d.postulacionIds.map((postulacionId) => ({ pasoId: d.id, postulacionId })),
          skipDuplicates: true,
        });
        if (eventos.length) await tx.outbox.createMany({ data: aFilasOutbox(eventos) });
      });
    } catch (e) {
      if (esUnicoViolado(e, 'referencia_externa'))
        throw new DatoInvalido('referenciaExterna', 'Ya hay un paso de ese correo o mensaje');
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2003')
        throw new DatoInvalido('postulacionIds', 'Alguna de las postulaciones no existe');
      throw e;
    }
    paso.marcarGuardado(creado ? 0 : d.version + 1);
    if (eventos.length) this.oyente?.publicar(eventos);
  }
}
