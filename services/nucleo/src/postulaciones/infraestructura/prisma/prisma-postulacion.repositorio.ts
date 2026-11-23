import type { GeneradorId } from '../../../compartido/dominio/puertos';
import { esUnicoViolado, type PrismaClient } from '../../../compartido/infraestructura/prisma';
import { ConflictoDeVersion, PostulacionDuplicada, SenalDuplicada } from '../../dominio/errores';
import { Postulacion } from '../../dominio/postulacion';
import type { PostulacionRepositorio } from '../../dominio/postulacion.repositorio';
import { aEventosGuardados, aFilasOutbox, type OyenteDeEventos } from '../outbox/outbox';
import { cambioAFila, datosAFila, discrepanciaAFila, filaADatos, INCLUIR_TODO, senalAFila } from './mapper';

/**
 * Adaptador de salida (backend.md §5.2). Guarda el agregado, sus partes nuevas o editadas y sus
 * eventos en el outbox en una sola transacción, con bloqueo optimista por `version` (R10).
 */
export class PrismaPostulacionRepositorio implements PostulacionRepositorio {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ids: GeneradorId,
    private readonly oyente?: OyenteDeEventos,
    private readonly correlacion: () => string | null = () => null,
  ) {}

  async porId(id: string): Promise<Postulacion | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const fila = await this.prisma.postulacion.findUnique({ where: { id }, include: INCLUIR_TODO });
    return fila ? Postulacion.reconstituir(filaADatos(fila)) : null;
  }

  async idPorUrl(url: string): Promise<string | null> {
    const fila = await this.prisma.postulacion.findFirst({ where: { avisoUrl: url }, select: { id: true } });
    return fila?.id ?? null;
  }

  async guardar(p: Postulacion): Promise<void> {
    const d = p.datos();
    const pend = p.cambiosPendientes();
    const esNuevo = (x: { id: string }) => pend.nuevos.has(x.id);
    const esEditado = (x: { id: string }) => pend.modificados.has(x.id);
    const eventos = aEventosGuardados(p.sacarEventos(), this.ids, this.correlacion());
    let nuevaVersion = d.version;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (pend.creada) {
          await tx.postulacion.create({
            data: { id: d.id, ...datosAFila(d), version: d.version, creadaEn: d.creadaEn },
          });
        } else {
          const r = await tx.postulacion.updateMany({
            where: { id: d.id, version: d.version },
            data: { ...datosAFila(d), version: { increment: 1 } },
          });
          if (r.count === 0) throw new ConflictoDeVersion();
          nuevaVersion = d.version + 1;
        }

        const cambios = d.historial.filter(esNuevo).map((c) => cambioAFila(d.id, c));
        if (cambios.length) await tx.cambioEstado.createMany({ data: cambios });
        const senales = d.senales.filter(esNuevo).map((s) => senalAFila(d.id, s));
        if (senales.length) await tx.senal.createMany({ data: senales });
        const discrepancias = d.discrepancias.filter(esNuevo).map((x) => discrepanciaAFila(d.id, x));
        if (discrepancias.length) await tx.discrepancia.createMany({ data: discrepancias });
        const entrevistas = d.entrevistas.filter(esNuevo).map((e) => ({
          id: e.id,
          postulacionId: d.id,
          fecha: e.fecha,
          tipo: e.tipo,
          con: e.con ?? null,
          resultado: e.resultado,
        }));
        if (entrevistas.length) await tx.entrevista.createMany({ data: entrevistas });
        const contactos = d.contactos.filter(esNuevo).map((c) => ({
          id: c.id,
          postulacionId: d.id,
          nombre: c.nombre,
          rol: c.rol ?? null,
          email: c.email ?? null,
          linkedin: c.linkedin ?? null,
        }));
        if (contactos.length) await tx.contacto.createMany({ data: contactos });
        const notas = d.notas.filter(esNuevo).map((n) => ({ ...n, postulacionId: d.id }));
        if (notas.length) await tx.nota.createMany({ data: notas });

        for (const s of d.senales.filter(esEditado)) {
          await tx.senal.update({ where: { id: s.id }, data: { aplicada: s.aplicada } });
        }
        for (const x of d.discrepancias.filter(esEditado)) {
          await tx.discrepancia.update({
            where: { id: x.id },
            data: { estado: x.estado, resueltaEn: x.resueltaEn ?? null },
          });
        }
        for (const e of d.entrevistas.filter(esEditado)) {
          await tx.entrevista.update({ where: { id: e.id }, data: { resultado: e.resultado } });
        }

        if (eventos.length) await tx.outbox.createMany({ data: aFilasOutbox(eventos) });
      });
    } catch (error) {
      if (esUnicoViolado(error, 'aviso_url_activa')) {
        const otra = await this.prisma.postulacion.findUnique({
          where: { avisoUrlActiva: d.aviso.url },
          select: { id: true },
        });
        throw new PostulacionDuplicada(d.aviso.url, otra?.id);
      }
      if (esUnicoViolado(error, 'referencia_externa')) {
        const ref = d.senales.find((s) => esNuevo(s) && s.referenciaExterna)?.referenciaExterna ?? '';
        throw new SenalDuplicada(ref);
      }
      throw error;
    }

    p.marcarGuardada(nuevaVersion);
    if (eventos.length) this.oyente?.publicar(eventos);
  }
}
