import type { GeneradorId } from '../../../compartido/dominio/puertos';
import { esUnicoViolado, Prisma, type PrismaClient } from '../../../compartido/infraestructura/prisma';
import { SenalDuplicada } from '../../dominio/errores';
import type { EstadoPostulacion } from '../../dominio/estado';
import type { Plataforma } from '../../dominio/objetos-valor/valores';
import type { FuenteDeSenal } from '../../dominio/partes';
import type { PropuestaDePaso } from '../../dominio/paso';
import {
  SenalPendiente,
  type BandejaRepositorio,
  type DatosPendiente,
  type EstadoDePendiente,
} from '../../dominio/senal-pendiente';
import { aEventosGuardados, aFilasOutbox, type OyenteDeEventos } from '../outbox/outbox';

type Fila = NonNullable<Awaited<ReturnType<PrismaClient['senalPendiente']['findUnique']>>>;

export function filaAPendiente(f: Fila): DatosPendiente {
  return {
    id: f.id,
    fuente: f.fuente as FuenteDeSenal,
    plataforma: f.plataforma as Plataforma,
    resumen: f.resumen,
    ...(f.estadoSugerido ? { estadoSugerido: f.estadoSugerido as EstadoPostulacion } : {}),
    confianza: Number(f.confianza),
    recibidaEn: f.recibidaEn,
    ...(f.referenciaExterna ? { referenciaExterna: f.referenciaExterna } : {}),
    ...(f.remitente ? { remitente: f.remitente } : {}),
    ...(f.asunto ? { asunto: f.asunto } : {}),
    ...(f.empresaDetectada ? { empresaDetectada: f.empresaDetectada } : {}),
    ...(f.cargoDetectado ? { cargoDetectado: f.cargoDetectado } : {}),
    candidatas: f.candidatas ?? [],
    ...(f.pasoPropuesto ? { pasoPropuesto: f.pasoPropuesto as unknown as PropuestaDePaso } : {}),
    estado: f.estado as EstadoDePendiente,
    ...(f.postulacionId ? { postulacionId: f.postulacionId } : {}),
    ...(f.resueltaEn ? { resueltaEn: f.resueltaEn } : {}),
    creadaEn: f.creadaEn,
  };
}

/** Adaptador de salida de la Bandeja: guarda la señal pendiente y su evento en una transacción. */
export class PrismaBandeja implements BandejaRepositorio {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ids: GeneradorId,
    private readonly oyente?: OyenteDeEventos,
  ) {}

  async porId(id: string): Promise<SenalPendiente | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const f = await this.prisma.senalPendiente.findUnique({ where: { id } });
    return f ? SenalPendiente.reconstituir(filaAPendiente(f)) : null;
  }

  async referenciaUsada(referencia: string): Promise<boolean> {
    const [a, b] = await Promise.all([
      this.prisma.senal.count({ where: { referenciaExterna: referencia } }),
      this.prisma.senalPendiente.count({ where: { referenciaExterna: referencia } }),
    ]);
    return a + b > 0;
  }

  async referenciaEnBandeja(referencia: string): Promise<boolean> {
    return (await this.prisma.senalPendiente.count({ where: { referenciaExterna: referencia } })) > 0;
  }

  async guardar(
    s: SenalPendiente,
    evento?: { tipo: string; prioridad: 'alta' | 'media' | 'baja' },
  ): Promise<void> {
    const d = s.datos();
    const fila = {
      fuente: d.fuente,
      plataforma: d.plataforma,
      resumen: d.resumen,
      estadoSugerido: d.estadoSugerido ?? null,
      confianza: d.confianza,
      referenciaExterna: d.referenciaExterna ?? null,
      recibidaEn: d.recibidaEn,
      remitente: d.remitente ?? null,
      asunto: d.asunto ?? null,
      empresaDetectada: d.empresaDetectada ?? null,
      cargoDetectado: d.cargoDetectado ?? null,
      candidatas: d.candidatas,
      pasoPropuesto: d.pasoPropuesto ? { ...d.pasoPropuesto } : Prisma.DbNull,
      estado: d.estado,
      postulacionId: d.postulacionId ?? null,
      resueltaEn: d.resueltaEn ?? null,
    };
    const eventos = evento
      ? aEventosGuardados(
          [
            {
              tipo: evento.tipo,
              version: 1,
              ocurridoEn: d.creadaEn,
              prioridad: evento.prioridad,
              datos: { senalId: d.id, resumen: d.resumen },
            },
          ],
          this.ids,
          null,
        )
      : [];
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.senalPendiente.upsert({
          where: { id: d.id },
          create: { id: d.id, ...fila, creadaEn: d.creadaEn },
          update: fila,
        });
        if (eventos.length) await tx.outbox.createMany({ data: aFilasOutbox(eventos) });
      });
    } catch (e) {
      if (esUnicoViolado(e, 'referencia_externa')) throw new SenalDuplicada(d.referenciaExterna ?? '');
      throw e;
    }
    if (eventos.length) this.oyente?.publicar(eventos);
  }

  async pendientes(): Promise<DatosPendiente[]> {
    const filas = await this.prisma.senalPendiente.findMany({
      where: { estado: 'pendiente' },
      orderBy: { recibidaEn: 'desc' },
    });
    return filas.map(filaAPendiente);
  }
}
