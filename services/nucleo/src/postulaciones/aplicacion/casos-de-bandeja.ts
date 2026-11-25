import { DatoInvalido, NoEncontrada, SenalDuplicada, SenalEnBandeja } from '../dominio/errores';
import type { EstadoPostulacion } from '../dominio/estado';
import type { Plataforma } from '../dominio/objetos-valor/valores';
import type { FuenteDeSenal, Senal } from '../dominio/partes';
import { propuestaDePaso, type FuenteDePaso, type RegistradorDePaso } from '../dominio/paso';
import { SenalPendiente, type DatosPendiente } from '../dominio/senal-pendiente';
import { deps, detalleOFalla, modificar, type Contexto } from './base';
import { CrearPostulacion, RegistrarSenal } from './casos-de-escritura';
import { cerrarCumplidos, pasoDeCorreo } from './casos-de-pasos';
import type { VistaDetalle, VistaPaso } from './vistas';

export type VistaPendiente = Omit<DatosPendiente, 'recibidaEn' | 'resueltaEn' | 'creadaEn'> & {
  recibidaEn: string;
  resueltaEn: string | null;
  creadaEn: string;
};

export function aVistaPendiente(d: DatosPendiente): VistaPendiente {
  return {
    ...d,
    recibidaEn: d.recibidaEn.toISOString(),
    resueltaEn: d.resueltaEn?.toISOString() ?? null,
    creadaEn: d.creadaEn.toISOString(),
  };
}

export interface EntradaSenalRecibida {
  postulacionId?: string;
  /** Un correo puede tocar varias postulaciones (pasos.md §4.2). Se junta con `postulacionId`. */
  postulacionIds?: string[];
  fuente: FuenteDeSenal;
  plataforma?: Plataforma;
  resumen: string;
  estadoSugerido?: EstadoPostulacion;
  confianza: number;
  recibidaEn?: Date;
  referenciaExterna?: string;
  remitente?: string;
  asunto?: string;
  empresaDetectada?: string;
  cargoDetectado?: string;
  /** Sin postulación: las que la IA propone sin certeza, para marcarlas en la bandeja. */
  candidatas?: string[];
  /** Lo que el correo pide hacer (pasos.md §5.2). `mismoQue`: solo recuerda ese paso pendiente. */
  paso?: { descripcion: string; detalle?: string; plazo?: string; enlace?: string; mismoQue?: string };
  /** Pasos pendientes que este correo da por hechos, con la confianza del modelo (R20). */
  pasosCumplidos?: { id: string; confianza: number }[];
  /** Quién la manda: el lector de correo (`vigia`) o la IA de la persona por MCP (`ia`). */
  registradoPor?: RegistradorDePaso;
}

export interface SenalEnPostulacion {
  postulacionId: string;
  senalId: string | null;
  aplicada: boolean;
  repetida: boolean;
}

export interface ResultadoDePasos {
  paso: VistaPaso | null;
  accion: 'creado' | 'recordado' | 'ya_estaba' | null;
  cerrados: string[];
  sugeridos: string[];
}

export type ResultadoRecepcion =
  | ({
      destino: 'postulacion';
      /** La primera señal nueva y su postulación (compatibilidad con un solo destino). */
      senal: Senal;
      postulacion: VistaDetalle;
      senales: SenalEnPostulacion[];
    } & ResultadoDePasos)
  | { destino: 'bandeja'; pendiente: VistaPendiente };

const REGISTRADOR_DEL_PASO: Record<FuenteDeSenal, RegistradorDePaso> = {
  correo: 'vigia',
  plataforma: 'vigia',
  manual: 'persona',
  ia: 'ia',
};

const FUENTE_DEL_PASO: Record<FuenteDeSenal, FuenteDePaso> = {
  correo: 'correo',
  plataforma: 'portal',
  manual: 'persona',
  ia: 'portal',
};

/**
 * Las señales entran como comando (backend.md C3): con postulaciones, se registran en cada una;
 * sin postulación, quedan en la Bandeja hasta que la persona decida. Si el correo pide algo, se crea
 * un paso ligado a todas (pasos.md §5). Repetir el mismo correo no duplica nada.
 */
export class RecibirSenal {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: EntradaSenalRecibida): Promise<ResultadoRecepcion> {
    const {
      postulacionId,
      postulacionIds,
      remitente,
      asunto,
      empresaDetectada,
      cargoDetectado,
      candidatas,
      paso,
      pasosCumplidos: _pasosCumplidos,
      registradoPor: _registradoPor,
      ...senal
    } = e;
    const ids = [...new Set([...(postulacionId ? [postulacionId] : []), ...(postulacionIds ?? [])])];
    if (ids.length) {
      // Antes de crear pasos: si el correo pasó por la bandeja y no está en estas postulaciones, va con «asociar».
      await this.exigirFueraDeBandeja(ids, senal.referenciaExterna);
      const senales: SenalEnPostulacion[] = [];
      let primera: { senal: Senal; postulacion: VistaDetalle } | undefined;
      for (const id of ids) {
        try {
          const r = await new RegistrarSenal(this.c).ejecutar({
            id,
            ...senal,
            ...(remitente ? { remitente } : {}),
            ...(asunto ? { asunto } : {}),
            ...(ids.length > 1 ? { sinAplicar: true } : {}),
          });
          primera ??= r;
          senales.push({
            postulacionId: id,
            senalId: r.senal.id,
            aplicada: r.senal.aplicada,
            repetida: false,
          });
        } catch (err) {
          if (!(err instanceof SenalDuplicada) || !senal.referenciaExterna) throw err;
          senales.push({ postulacionId: id, senalId: null, aplicada: false, repetida: true });
        }
      }
      const pasos = await this.pasos(ids, e);
      if (!primera) {
        // Todo estaba registrado: solo es novedad si cambió algún paso; si no, YA_EXISTE como siempre.
        const nada =
          (pasos.accion === null || pasos.accion === 'ya_estaba') &&
          !pasos.cerrados.length &&
          !pasos.sugeridos.length;
        if (nada) throw new SenalDuplicada(senal.referenciaExterna ?? '');
        const postulacion = await detalleOFalla(this.c, ids[0]!);
        const previa = postulacion.senales.find((x) => x.referenciaExterna === senal.referenciaExterna);
        if (!previa) throw new SenalEnBandeja(senal.referenciaExterna ?? '');
        primera = { senal: { ...previa, recibidaEn: new Date(previa.recibidaEn) }, postulacion };
      } else if (pasos.paso || pasos.cerrados.length || pasos.sugeridos.length) {
        primera = { ...primera, postulacion: await detalleOFalla(this.c, primera.postulacion.id) };
      }
      return { destino: 'postulacion', ...primera, senales, ...pasos };
    }
    if (senal.referenciaExterna && (await this.c.bandeja.referenciaUsada(senal.referenciaExterna))) {
      throw new SenalDuplicada(senal.referenciaExterna);
    }
    const p = SenalPendiente.crear(
      {
        ...senal,
        ...(remitente ? { remitente } : {}),
        ...(asunto ? { asunto } : {}),
        ...(empresaDetectada ? { empresaDetectada } : {}),
        ...(cargoDetectado ? { cargoDetectado } : {}),
        ...(candidatas?.length ? { candidatas } : {}),
        ...(paso ? { pasoPropuesto: paso } : {}),
      },
      deps(this.c),
    );
    // Un correo que pide algo y no sabemos de quién es avisa con prioridad alta.
    await this.c.bandeja.guardar(p, { tipo: 'senal.sin_asociar', prioridad: paso ? 'alta' : 'media' });
    return { destino: 'bandeja', pendiente: aVistaPendiente(p.datos()) };
  }

  /**
   * Una referencia que está en la bandeja solo se repite en una postulación que ya la tiene (asociada antes).
   * Si ninguna de las pedidas la tiene, el camino es asociar_senal (ADR 0015): se avisa antes de tocar pasos.
   */
  private async exigirFueraDeBandeja(ids: string[], referencia?: string): Promise<void> {
    if (!referencia || !(await this.c.bandeja.referenciaEnBandeja(referencia))) return;
    for (const id of ids) {
      const p = await detalleOFalla(this.c, id);
      if (p.senales.some((x) => x.referenciaExterna === referencia)) return;
    }
    const pendiente = (await this.c.bandeja.pendientes()).find((x) => x.referenciaExterna === referencia);
    throw new SenalEnBandeja(referencia, pendiente?.id);
  }

  private async pasos(ids: string[], e: EntradaSenalRecibida): Promise<ResultadoDePasos> {
    const r: ResultadoDePasos = { paso: null, accion: null, cerrados: [], sugeridos: [] };
    if (e.pasosCumplidos?.length) {
      Object.assign(
        r,
        await cerrarCumplidos(this.c, {
          postulacionIds: ids,
          cumplidos: e.pasosCumplidos,
          ...(e.referenciaExterna ? { referenciaExterna: e.referenciaExterna } : {}),
        }),
      );
    }
    if (e.paso) {
      const { mismoQue, ...resto } = e.paso;
      const x = await pasoDeCorreo(this.c, {
        postulacionIds: ids,
        paso: { ...propuestaDePaso(resto), ...(mismoQue ? { mismoQue } : {}) },
        fuente: FUENTE_DEL_PASO[e.fuente],
        registradoPor: e.registradoPor ?? 'vigia',
        ...(e.referenciaExterna ? { referenciaExterna: e.referenciaExterna } : {}),
        pedidoEn: e.recibidaEn ?? this.c.reloj.ahora(),
      });
      r.paso = x.paso;
      r.accion = x.accion;
    }
    return r;
  }
}

export class ListarBandeja {
  constructor(private readonly c: Contexto) {}
  async ejecutar(): Promise<VistaPendiente[]> {
    return (await this.c.bandeja.pendientes()).map(aVistaPendiente);
  }
}

async function pendienteOFalla(c: Contexto, id: string): Promise<SenalPendiente> {
  const p = await c.bandeja.porId(id);
  if (!p) throw new NoEncontrada('La señal');
  return p;
}

export class AsociarSenal {
  constructor(private readonly c: Contexto) {}
  /** A una o varias postulaciones (pasos.md §7.3). Si el correo pidió algo, el paso se crea ligado a todas. */
  async ejecutar(e: {
    senalId: string;
    postulacionId?: string;
    postulacionIds?: string[];
  }): Promise<VistaDetalle> {
    const ids = [...new Set([...(e.postulacionId ? [e.postulacionId] : []), ...(e.postulacionIds ?? [])])];
    if (!ids.length) throw new DatoInvalido('postulacionIds', 'Elige al menos una postulación');
    const pendiente = await pendienteOFalla(this.c, e.senalId);
    pendiente.asociar(ids[0]!, this.c.reloj.ahora()); // valida que siga pendiente antes de tocar las postulaciones
    const [seguras, umbral] = await Promise.all([
      this.c.ajustes.aplicarSenalesSeguras(),
      this.c.ajustes.umbralConfianza(),
    ]);
    const aplicarSeguras = seguras && ids.length === 1;
    for (const id of ids) {
      await modificar(this.c, id, undefined, (p) =>
        p.registrarSenal(pendiente.comoSenal(), { ...deps(this.c), aplicarSeguras, umbral }),
      );
    }
    const d = pendiente.datos();
    if (d.pasoPropuesto) {
      await pasoDeCorreo(this.c, {
        postulacionIds: ids,
        paso: d.pasoPropuesto,
        fuente: FUENTE_DEL_PASO[d.fuente],
        // Lo leyó Brecha (o tu IA); la persona solo eligió a qué postulaciones va.
        registradoPor: REGISTRADOR_DEL_PASO[d.fuente],
        ...(d.referenciaExterna ? { referenciaExterna: d.referenciaExterna } : {}),
        pedidoEn: d.recibidaEn,
      });
    }
    await this.c.bandeja.guardar(pendiente);
    return detalleOFalla(this.c, ids[0]!);
  }
}

export class CrearDesdeSenal {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    senalId: string;
    aviso: Parameters<CrearPostulacion['ejecutar']>[0]['aviso'];
  }): Promise<VistaDetalle> {
    const pendiente = await pendienteOFalla(this.c, e.senalId);
    pendiente.exigirPendiente();
    const creada = await new CrearPostulacion(this.c).ejecutar({ aviso: e.aviso, origen: 'formulario' });
    return new AsociarSenal(this.c).ejecutar({ senalId: e.senalId, postulacionId: creada.id });
  }
}

export class DescartarSenal {
  constructor(private readonly c: Contexto) {}
  async ejecutar(senalId: string): Promise<VistaPendiente> {
    const p = await pendienteOFalla(this.c, senalId);
    p.descartar(this.c.reloj.ahora());
    await this.c.bandeja.guardar(p);
    return aVistaPendiente(p.datos());
  }
}
