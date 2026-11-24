import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../compartido/infraestructura/prisma';
import type { Fecha } from '../../compartido/dominio/puertos';
import type { AjustesArriendos, BandejaArriendos, SenalPendiente, SenalSuelta } from '../aplicacion/puertos';
import { Busqueda, busquedaVacia, type DatosBusqueda } from '../dominio/busqueda';
import { Canal, CANALES_INICIALES, type DatosCanal, type TipoDeCanal } from '../dominio/canal';
import type { EstadoPropiedad } from '../dominio/estado';
import { Propiedad, type DatosPropiedad, type EventoDePropiedad } from '../dominio/propiedad';
import type { BusquedaRepositorio, CanalRepositorio, PropiedadRepositorio } from '../dominio/puertos';
import { ConflictoDeVersion } from '../dominio/valores';

/** Mismo sobre que el outbox y el flujo SSE de empleo (PLAN §12.4), sin importar ese contexto. */
export interface EventoGuardado {
  id: string;
  tipo: string;
  version: number;
  ocurridoEn: string;
  prioridad: string;
  correlacionId: string | null;
  datos: object;
}

export interface Oyente {
  publicar(eventos: EventoGuardado[]): void;
}

// Fechas dentro del JSON: se guardan en ISO y se revive cada campo conocido.
const CAMPOS_FECHA = new Set([
  'vistaEn',
  'ocurridaEn',
  'fecha',
  'creadaEn',
  'ocurridoEn',
  'recibidaEn',
  'detectadaEn',
]);

function revivir<T>(v: unknown): T {
  return JSON.parse(JSON.stringify(v), (k, x) =>
    CAMPOS_FECHA.has(k) && typeof x === 'string' ? new Date(x) : x,
  ) as T;
}

type FilaPropiedad = NonNullable<Awaited<ReturnType<PrismaClient['propiedad']['findUnique']>>>;

function aPropiedad(f: FilaPropiedad): Propiedad {
  const datos = revivir<Omit<DatosPropiedad, 'id' | 'estado' | 'version' | 'creadaEn' | 'actualizadaEn'>>(
    f.datos,
  );
  return Propiedad.reconstituir({
    ...datos,
    id: f.id,
    estado: f.estado as EstadoPropiedad,
    version: f.version,
    creadaEn: f.creadaEn,
    actualizadaEn: f.actualizadaEn,
  });
}

export class PrismaPropiedades implements PropiedadRepositorio {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly oyente?: Oyente,
  ) {}

  async porId(id: string): Promise<Propiedad | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const f = await this.prisma.propiedad.findUnique({ where: { id } });
    return f ? aPropiedad(f) : null;
  }

  async porUrlClave(urlClave: string): Promise<Propiedad | null> {
    const f = await this.prisma.propiedad.findFirst({ where: { urls: { has: urlClave } } });
    return f ? aPropiedad(f) : null;
  }

  async todas(): Promise<Propiedad[]> {
    const filas = await this.prisma.propiedad.findMany({ orderBy: { actualizadaEn: 'desc' } });
    return filas.map(aPropiedad);
  }

  /**
   * Guarda con control optimista (versión leída) y deja los eventos en el outbox en la misma transacción;
   * después los avisa en vivo (consola, barra de menú y hooks).
   */
  async guardar(p: Propiedad, versionLeida: number | null): Promise<void> {
    const { id, estado, version: _v, creadaEn, actualizadaEn, ...resto } = p.datos();
    const eventos: EventoGuardado[] = p.sacarEventos().map((e: EventoDePropiedad) => ({
      id: randomUUID(),
      tipo: e.tipo,
      version: 1,
      ocurridoEn: e.ocurridoEn.toISOString(),
      prioridad: e.prioridad,
      correlacionId: null,
      datos: e.datos,
    }));
    const fila = {
      estado,
      titulo: resto.titulo,
      comuna: resto.comuna ?? null,
      urls: p.urlsClave(),
      datos: JSON.parse(JSON.stringify(resto)) as object,
      actualizadaEn,
    };
    await this.prisma.$transaction(async (tx) => {
      if (versionLeida === null) {
        await tx.propiedad.create({ data: { id, ...fila, version: 0, creadaEn } });
      } else {
        const r = await tx.propiedad.updateMany({
          where: { id, version: versionLeida },
          data: { ...fila, version: { increment: 1 } },
        });
        if (r.count === 0) throw new ConflictoDeVersion();
      }
      if (eventos.length)
        await tx.outbox.createMany({
          data: eventos.map((e) => ({
            id: e.id,
            tipo: e.tipo,
            version: e.version,
            prioridad: e.prioridad,
            datos: e.datos,
            correlacionId: null,
            ocurridoEn: new Date(e.ocurridoEn),
          })),
        });
    });
    // Aviso en vivo también cuando solo cambian datos, para que la consola recargue.
    this.oyente?.publicar(
      eventos.length
        ? eventos
        : [
            {
              id: randomUUID(),
              tipo: 'propiedad.actualizada',
              version: 1,
              ocurridoEn: new Date().toISOString(),
              prioridad: 'baja',
              correlacionId: null,
              datos: { propiedadId: id, pendiente: p.pendiente() },
            },
          ],
    );
  }

  async borrar(id: string): Promise<void> {
    await this.prisma.propiedad.deleteMany({ where: { id } });
    this.oyente?.publicar([
      {
        id: randomUUID(),
        tipo: 'propiedad.borrada',
        version: 1,
        ocurridoEn: new Date().toISOString(),
        prioridad: 'baja',
        correlacionId: null,
        datos: { propiedadId: id },
      },
    ]);
  }
}

export class PrismaCanales implements CanalRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  /** Los canales de partida se aseguran en cada lectura (un INSERT … ON CONFLICT DO NOTHING): si faltan, vuelven. */
  private async sembrar(): Promise<void> {
    const ahora = new Date();
    await this.prisma.canalArriendo.createMany({
      data: CANALES_INICIALES.map((c) => ({ ...Canal.inicial(c, ahora).datos() })),
      skipDuplicates: true,
    });
  }

  private aCanal(f: NonNullable<Awaited<ReturnType<PrismaClient['canalArriendo']['findUnique']>>>): Canal {
    return Canal.reconstituir({ ...f, tipo: f.tipo as TipoDeCanal } satisfies DatosCanal);
  }

  async porId(id: string): Promise<Canal | null> {
    await this.sembrar();
    const f = await this.prisma.canalArriendo.findUnique({ where: { id } });
    return f ? this.aCanal(f) : null;
  }

  async todos(): Promise<Canal[]> {
    await this.sembrar();
    const filas = await this.prisma.canalArriendo.findMany({
      orderBy: [{ predefinido: 'desc' }, { nombre: 'asc' }],
    });
    return filas.map((f) => this.aCanal(f));
  }

  async guardar(c: Canal): Promise<void> {
    const d = c.datos();
    await this.prisma.canalArriendo.upsert({ where: { id: d.id }, create: d, update: d });
  }
}

export class PrismaBusqueda implements BusquedaRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async leer(): Promise<Busqueda> {
    const f = await this.prisma.busquedaArriendo.findUnique({ where: { id: 1 } });
    if (!f) return Busqueda.reconstituir(busquedaVacia());
    const d = f.datos as unknown as Omit<DatosBusqueda, 'actualizadaEn'>;
    return Busqueda.reconstituir({
      ...d,
      historial: d.historial.map((h) => ({ ...h, ocurridoEn: new Date(h.ocurridoEn) })),
      actualizadaEn: f.actualizadaEn,
    });
  }

  async guardar(b: Busqueda): Promise<void> {
    const { actualizadaEn, ...resto } = b.datos();
    const datos = JSON.parse(JSON.stringify(resto)) as object;
    const cuando = actualizadaEn ?? new Date();
    await this.prisma.busquedaArriendo.upsert({
      where: { id: 1 },
      create: { id: 1, datos, actualizadaEn: cuando },
      update: { datos, actualizadaEn: cuando },
    });
  }
}

type FilaPendiente = NonNullable<Awaited<ReturnType<PrismaClient['senalArriendoPendiente']['findUnique']>>>;

function aPendiente(f: FilaPendiente): SenalPendiente {
  const d = f.datos as unknown as SenalSuelta;
  return {
    ...d,
    id: f.id,
    estado: f.estado as SenalPendiente['estado'],
    ...(f.propiedadId ? { propiedadId: f.propiedadId } : {}),
    creadaEn: f.creadaEn.toISOString(),
  };
}

export class PrismaBandejaArriendos implements BandejaArriendos {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly oyente?: Oyente,
  ) {}

  async agregar(s: SenalSuelta, id: string, ahora: Date): Promise<SenalPendiente | null> {
    if (s.referenciaExterna) {
      const ya = await this.prisma.senalArriendoPendiente.findUnique({
        where: { referenciaExterna: s.referenciaExterna },
      });
      if (ya) return null;
    }
    const f = await this.prisma.senalArriendoPendiente.create({
      data: {
        id,
        estado: 'pendiente',
        datos: JSON.parse(JSON.stringify(s)) as object,
        referenciaExterna: s.referenciaExterna ?? null,
        recibidaEn: new Date(s.recibidaEn),
        creadaEn: ahora,
      },
    });
    this.oyente?.publicar([
      {
        id: randomUUID(),
        tipo: 'arriendos.bandeja',
        version: 1,
        ocurridoEn: ahora.toISOString(),
        prioridad: 'media',
        correlacionId: null,
        datos: { senalId: id, resumen: s.resumen },
      },
    ]);
    return aPendiente(f);
  }

  async pendientes(): Promise<SenalPendiente[]> {
    const filas = await this.prisma.senalArriendoPendiente.findMany({
      where: { estado: 'pendiente' },
      orderBy: { recibidaEn: 'desc' },
    });
    return filas.map(aPendiente);
  }

  async porId(id: string): Promise<SenalPendiente | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const f = await this.prisma.senalArriendoPendiente.findUnique({ where: { id } });
    return f ? aPendiente(f) : null;
  }

  async resolver(
    id: string,
    estado: 'asociada' | 'descartada',
    propiedadId: string | null,
    ahora: Date,
  ): Promise<void> {
    await this.prisma.senalArriendoPendiente.update({
      where: { id },
      data: { estado, propiedadId, resueltaEn: ahora },
    });
  }
}

export class PrismaAjustesArriendos implements AjustesArriendos {
  constructor(private readonly prisma: PrismaClient) {}

  async umbral(): Promise<number> {
    const f = await this.prisma.ajuste.findUnique({ where: { clave: 'umbral_confianza' } });
    const v = f?.valor;
    return typeof v === 'number' && v >= 0 && v <= 1 ? v : 0.9;
  }

  async uf(): Promise<{ valor: number; fecha: Fecha } | null> {
    const f = await this.prisma.ajuste.findUnique({ where: { clave: 'arriendos.uf' } });
    const v = f?.valor as { valor?: unknown; fecha?: unknown } | undefined;
    return v && typeof v.valor === 'number' && typeof v.fecha === 'string'
      ? { valor: v.valor, fecha: v.fecha }
      : null;
  }

  async fijarUf(valor: number, fecha: Fecha): Promise<void> {
    await this.prisma.ajuste.upsert({
      where: { clave: 'arriendos.uf' },
      create: { clave: 'arriendos.uf', valor: { valor, fecha } },
      update: { valor: { valor, fecha } },
    });
  }
}
