import type { Prioridad } from '../../../compartido/dominio/evento-de-dominio';
import type { Reloj } from '../../../compartido/dominio/puertos';
import type { Prisma, PrismaClient } from '../../../compartido/infraestructura/prisma';
import { ESTADOS, type EstadoPostulacion } from '../../dominio/estado';
import type { Modalidad, Plataforma } from '../../dominio/objetos-valor/valores';
import { calcularPrioridad } from '../../dominio/politica-de-prioridad';
import type {
  ConsultasDePostulaciones,
  EtiquetaEnUso,
  FiltrosPostulaciones,
  Pagina,
} from '../../aplicacion/puertos';
import {
  aDetalle,
  aPasoCorto,
  aVistaPaso,
  diasAlCierre,
  ordenarPendientes,
  ordenarPorPrioridad,
  ordenarTarjetas,
  transicionesPosibles,
  type ElementoResumen,
  type PostulacionDelPaso,
  type VistaExportacion,
  type VistaPaso,
  type VistaResumen,
  type VistaTablero,
} from '../../aplicacion/vistas';
import type { DatosPaso, EstadoDePaso } from '../../dominio/paso';
import { idDeAviso } from '../../dominio/id-de-aviso';
import { aFecha, deFecha, filaADatos, INCLUIR_TODO } from './mapper';
import { filaAPaso, INCLUIR_PASO } from './prisma-pasos';

type InfoPostulaciones = Map<string, Omit<PostulacionDelPaso, 'id'>>;

const SELECT_RESUMEN = {
  id: true,
  avisoTitulo: true,
  avisoEmpresa: true,
  avisoUrl: true,
  avisoPlataforma: true,
  avisoModalidad: true,
  avisoUbicacion: true,
  avisoCierre: true,
  estado: true,
  etiquetas: true,
  prioridadFijada: true,
  fechaPostulacion: true,
  version: true,
  actualizadaEn: true,
  _count: {
    select: {
      senales: { where: { aplicada: false } },
      discrepancias: { where: { estado: 'abierta' } },
    },
  },
  pasos: {
    where: { paso: { estado: 'pendiente' } },
    select: { paso: { select: { id: true, descripcion: true, plazo: true, pedidoEn: true } } },
  },
} satisfies Prisma.PostulacionSelect;

type FilaResumen = Prisma.PostulacionGetPayload<{ select: typeof SELECT_RESUMEN }>;

const AVANCE: EstadoPostulacion[] = ['postulado', 'en_proceso', 'entrevista', 'oferta'];
const PREVIOS: EstadoPostulacion[] = ['sin_decidir', 'por_postular'];
const CERRADOS: EstadoPostulacion[] = ['descartado', 'rechazado', 'aceptada'];

/** Lado de lectura con consultas directas (backend.md §4, C7). */
export class PrismaConsultas implements ConsultasDePostulaciones {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly reloj: Reloj,
  ) {}

  async listar(f: FiltrosPostulaciones, p: Pagina) {
    const where = this.donde(f);
    if (f.url) {
      // El filtro por URL busca el número del aviso con `contains`; aquí se descartan los que solo lo contienen de paso.
      const id = idDeAviso(f.url);
      const filas = await this.prisma.postulacion.findMany({
        where,
        select: SELECT_RESUMEN,
        orderBy: [{ actualizadaEn: 'desc' }, { id: 'asc' }],
      });
      const items = filas
        .filter((x) => x.avisoUrl === f.url!.trim() || (id !== null && idDeAviso(x.avisoUrl) === id))
        .map((x) => this.aResumen(x));
      return { items: items.slice(p.offset, p.offset + p.limit), total: items.length };
    }
    const [filas, total] = await Promise.all([
      this.prisma.postulacion.findMany({
        where,
        select: SELECT_RESUMEN,
        orderBy: [{ actualizadaEn: 'desc' }, { id: 'asc' }],
        take: p.limit,
        skip: p.offset,
      }),
      this.prisma.postulacion.count({ where }),
    ]);
    return { items: filas.map((x) => this.aResumen(x)), total };
  }

  async tablero(f: Pick<FiltrosPostulaciones, 'etiquetas'> = {}): Promise<VistaTablero> {
    const filas = await this.prisma.postulacion.findMany({
      ...(f.etiquetas?.length ? { where: { etiquetas: { hasEvery: f.etiquetas } } } : {}),
      select: SELECT_RESUMEN,
    });
    const resumenes = filas.map((x) => this.aResumen(x));
    return {
      columnas: ESTADOS.map((estado) => {
        const items = resumenes.filter((r) => r.estado === estado).sort(ordenarTarjetas);
        return { estado, total: items.length, items };
      }),
    };
  }

  async etiquetasEnUso(): Promise<EtiquetaEnUso[]> {
    const filas = await this.prisma.$queryRaw<{ etiqueta: string; total: bigint }[]>`
      SELECT e AS etiqueta, count(*) AS total FROM postulacion, unnest(etiquetas) AS e
      GROUP BY e ORDER BY count(*) DESC, e ASC`;
    return filas.map((x) => ({ etiqueta: x.etiqueta, total: Number(x.total) }));
  }

  async detalle(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const fila = await this.prisma.postulacion.findUnique({ where: { id }, include: INCLUIR_TODO });
    if (!fila) return null;
    const { pasos, info } = await this.pasosCon({ postulaciones: { some: { postulacionId: id } } });
    return aDetalle(filaADatos(fila), this.reloj, pasos, info);
  }

  async pasos(f: { estado?: EstadoDePaso; postulacionId?: string } = {}): Promise<VistaPaso[]> {
    if (f.postulacionId && !/^[0-9a-f-]{36}$/i.test(f.postulacionId)) return [];
    const { pasos, info } = await this.pasosCon({
      ...(f.estado ? { estado: f.estado } : {}),
      ...(f.postulacionId ? { postulaciones: { some: { postulacionId: f.postulacionId } } } : {}),
    });
    const pendientesPrimero = (a: DatosPaso, b: DatosPaso) =>
      Number(a.estado !== 'pendiente') - Number(b.estado !== 'pendiente') ||
      (a.estado === 'pendiente' ? ordenarPendientes(a, b) : b.pedidoEn.getTime() - a.pedidoEn.getTime());
    return [...pasos].sort(pendientesPrimero).map((x) => aVistaPaso(x, info, this.reloj));
  }

  async paso(id: string): Promise<VistaPaso | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { pasos, info } = await this.pasosCon({ id });
    return pasos[0] ? aVistaPaso(pasos[0], info, this.reloj) : null;
  }

  /** Pasos con la empresa, el cargo y el estado de cada postulación que tocan. */
  private async pasosCon(
    where: Prisma.PasoWhereInput,
  ): Promise<{ pasos: DatosPaso[]; info: InfoPostulaciones }> {
    const filas = await this.prisma.paso.findMany({
      where,
      include: INCLUIR_PASO,
      orderBy: [{ pedidoEn: 'asc' }, { id: 'asc' }],
    });
    const pasos = filas.map(filaAPaso);
    return { pasos, info: await this.infoDe(pasos) };
  }

  private async infoDe(pasos: readonly DatosPaso[]): Promise<InfoPostulaciones> {
    const ids = [...new Set(pasos.flatMap((p) => p.postulacionIds))];
    if (!ids.length) return new Map();
    const filas = await this.prisma.postulacion.findMany({
      where: { id: { in: ids } },
      select: { id: true, avisoEmpresa: true, avisoTitulo: true, estado: true },
    });
    return new Map(
      filas.map((f) => [
        f.id,
        { empresa: f.avisoEmpresa, titulo: f.avisoTitulo, estado: f.estado as EstadoPostulacion },
      ]),
    );
  }

  async resumenDesde(desde: Date): Promise<ElementoResumen[]> {
    const post = {
      select: {
        id: true,
        avisoEmpresa: true,
        avisoTitulo: true,
        estado: true,
        avisoCierre: true,
        prioridadFijada: true,
      },
    };
    const [cambios, senales, discrepancias, notas, pasos] = await Promise.all([
      this.prisma.cambioEstado.findMany({
        where: { ocurridoEn: { gte: desde } },
        include: { postulacion: post },
      }),
      this.prisma.senal.findMany({
        where: { recibidaEn: { gte: desde }, postulacionId: { not: null } },
        include: { postulacion: post },
      }),
      this.prisma.discrepancia.findMany({
        where: { detectadaEn: { gte: desde } },
        include: { postulacion: post },
      }),
      this.prisma.nota.findMany({ where: { creadaEn: { gte: desde } }, include: { postulacion: post } }),
      this.prisma.paso.findMany({
        where: { OR: [{ creadoEn: { gte: desde } }, { cerradoEn: { gte: desde } }] },
        include: { postulaciones: { select: { postulacion: post } } },
      }),
    ]);
    const hoy = this.reloj.hoy();
    const base = (p: {
      id: string;
      avisoEmpresa: string;
      avisoTitulo: string;
      estado: string;
      avisoCierre: Date | null;
      prioridadFijada: string | null;
    }) => ({
      postulacionId: p.id,
      empresa: p.avisoEmpresa,
      titulo: p.avisoTitulo,
      prioridad: calcularPrioridad(
        p.estado as EstadoPostulacion,
        p.avisoCierre ? aFecha(p.avisoCierre) : undefined,
        hoy,
        p.prioridadFijada as Prioridad | null,
      ),
    });
    const elementos: ElementoResumen[] = [
      ...cambios.map((c) => ({
        ...base(c.postulacion),
        tipo: 'cambio' as const,
        descripcion: `${c.de ?? 'nueva'} → ${c.a} (${c.origen})${c.motivo ? `: ${c.motivo}` : ''}`,
        ocurridoEn: c.ocurridoEn.toISOString(),
      })),
      ...senales.map((s) => ({
        ...base(s.postulacion!),
        tipo: 'senal' as const,
        descripcion: `${s.fuente}: ${s.resumen}${s.estadoSugerido ? ` (sugiere ${s.estadoSugerido})` : ''}`,
        ocurridoEn: s.recibidaEn.toISOString(),
      })),
      ...discrepancias.map((d) => ({
        ...base(d.postulacion),
        tipo: 'discrepancia' as const,
        descripcion: `${d.estado}: ${d.detalle}`,
        ocurridoEn: d.detectadaEn.toISOString(),
      })),
      ...notas.map((n) => ({
        ...base(n.postulacion),
        tipo: 'nota' as const,
        descripcion: n.texto.slice(0, 200),
        ocurridoEn: n.creadaEn.toISOString(),
      })),
      ...pasos.flatMap((x) =>
        x.postulaciones.map(({ postulacion }) => ({
          ...base(postulacion),
          // Un pedido pendiente es urgente aunque la postulación esté cerrada (R18).
          ...(x.estado === 'pendiente' ? { prioridad: 'alta' as const } : {}),
          tipo: 'paso' as const,
          descripcion:
            x.estado === 'pendiente'
              ? `te piden: ${x.descripcion}${x.plazo ? ` (plazo ${aFecha(x.plazo)})` : ''}`
              : `${x.estado}: ${x.descripcion}`,
          ocurridoEn: (x.cerradoEn ?? x.creadoEn).toISOString(),
        })),
      ),
    ];
    return elementos.sort((a, b) => ordenarPorPrioridad(a, b) || b.ocurridoEn.localeCompare(a.ocurridoEn));
  }

  async exportar(): Promise<VistaExportacion> {
    const filas = await this.prisma.postulacion.findMany({
      include: INCLUIR_TODO,
      orderBy: { actualizadaEn: 'desc' },
    });
    const { pasos, info } = await this.pasosCon({});
    const postulaciones = filas.map((f) =>
      aDetalle(
        filaADatos(f),
        this.reloj,
        pasos.filter((p) => p.postulacionIds.includes(f.id)),
        info,
      ),
    );
    const porPrioridad: Record<Prioridad, number> = { alta: 0, media: 0, baja: 0 };
    const porEstado: Record<string, number> = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    for (const p of postulaciones) {
      porPrioridad[p.prioridad] += 1;
      porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1;
    }
    return {
      generadoEn: this.reloj.ahora().toISOString(),
      conteos: { porEstado, porPrioridad },
      postulaciones,
    };
  }

  private aResumen(x: FilaResumen): VistaResumen {
    const estado = x.estado as EstadoPostulacion;
    const cierre = x.avisoCierre ? aFecha(x.avisoCierre) : null;
    return {
      id: x.id,
      titulo: x.avisoTitulo,
      empresa: x.avisoEmpresa,
      url: x.avisoUrl,
      plataforma: x.avisoPlataforma as Plataforma,
      modalidad: x.avisoModalidad as Modalidad,
      ubicacion: x.avisoUbicacion,
      cierre,
      diasAlCierre: diasAlCierre(cierre, this.reloj),
      estado,
      prioridad: calcularPrioridad(
        estado,
        cierre ?? undefined,
        this.reloj.hoy(),
        x.prioridadFijada as Prioridad | null,
      ),
      prioridadFijada: (x.prioridadFijada as Prioridad | null) ?? null,
      etiquetas: x.etiquetas ?? [],
      fechaPostulacion: x.fechaPostulacion ? aFecha(x.fechaPostulacion) : null,
      senalesNuevas: x._count.senales,
      discrepanciasAbiertas: x._count.discrepancias,
      pasosPendientes: x.pasos
        .map(({ paso: p }) => ({
          id: p.id,
          descripcion: p.descripcion,
          pedidoEn: p.pedidoEn,
          ...(p.plazo ? { plazo: aFecha(p.plazo) } : {}),
        }))
        .sort(ordenarPendientes)
        .map((p) => aPasoCorto(p, this.reloj)),
      transicionesPosibles: transicionesPosibles(estado, cierre, this.reloj),
      version: x.version,
      actualizadaEn: x.actualizadaEn.toISOString(),
    };
  }

  /** Traduce los filtros a SQL; la prioridad se expresa con las mismas reglas de R12. */
  private donde(f: FiltrosPostulaciones): Prisma.PostulacionWhereInput {
    const y: Prisma.PostulacionWhereInput[] = [];
    if (f.estados) y.push({ estado: { in: f.estados } });
    if (f.plataformas) y.push({ avisoPlataforma: { in: f.plataformas } });
    if (f.url) {
      const url = f.url.trim();
      const id = idDeAviso(url);
      y.push({ OR: [{ avisoUrl: url }, ...(id ? [{ avisoUrl: { contains: id } }] : [])] });
    }
    if (f.etiquetas?.length) y.push({ etiquetas: { hasEvery: f.etiquetas } });
    if (f.q) {
      y.push({
        OR: [
          { avisoTitulo: { contains: f.q, mode: 'insensitive' } },
          { avisoEmpresa: { contains: f.q, mode: 'insensitive' } },
        ],
      });
    }
    if (f.prioridades) {
      const hoy = deFecha(this.reloj.hoy());
      const en2 = new Date(hoy.getTime() + 2 * 86_400_000);
      const cierraPronto: Prisma.PostulacionWhereInput = { avisoCierre: { gte: hoy, lte: en2 } };
      const o: Prisma.PostulacionWhereInput[] = [];
      // Una prioridad fijada a mano manda en los estados abiertos (csv.md P2); si no hay, R12.
      const fijada = (p: Prioridad): Prisma.PostulacionWhereInput => ({
        AND: [{ prioridadFijada: p }, { estado: { notIn: CERRADOS } }],
      });
      const calculada: Prisma.PostulacionWhereInput = { prioridadFijada: null };
      if (f.prioridades.includes('alta')) {
        o.push(fijada('alta'), {
          AND: [
            calculada,
            { OR: [{ estado: { in: AVANCE } }, { AND: [{ estado: { in: PREVIOS } }, cierraPronto] }] },
          ],
        });
      }
      if (f.prioridades.includes('media')) {
        // Sin cierre o con cierre fuera de los próximos 2 días (un NOT con null en SQL dejaría fuera las sin cierre).
        const noPronto: Prisma.PostulacionWhereInput = {
          OR: [{ avisoCierre: null }, { avisoCierre: { lt: hoy } }, { avisoCierre: { gt: en2 } }],
        };
        o.push(fijada('media'), { AND: [calculada, { estado: { in: PREVIOS } }, noPronto] });
      }
      if (f.prioridades.includes('baja')) o.push(fijada('baja'), { estado: { in: CERRADOS } });
      y.push({ OR: o });
    }
    return y.length ? { AND: y } : {};
  }
}
