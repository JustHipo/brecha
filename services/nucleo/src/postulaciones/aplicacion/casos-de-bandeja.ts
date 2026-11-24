import { NoEncontrada, SenalDuplicada } from '../dominio/errores';
import type { EstadoPostulacion } from '../dominio/estado';
import type { Plataforma } from '../dominio/objetos-valor/valores';
import type { FuenteDeSenal, Senal } from '../dominio/partes';
import { SenalPendiente, type DatosPendiente } from '../dominio/senal-pendiente';
import { deps, detalleOFalla, modificar, type Contexto } from './base';
import { CrearPostulacion, RegistrarSenal } from './casos-de-escritura';
import type { VistaDetalle } from './vistas';

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
}

export type ResultadoRecepcion =
  | { destino: 'postulacion'; senal: Senal; postulacion: VistaDetalle }
  | { destino: 'bandeja'; pendiente: VistaPendiente };

/**
 * Las señales entran como comando (backend.md C3): con postulación, se registran en ella;
 * sin postulación, quedan en la Bandeja hasta que la persona decida.
 */
export class RecibirSenal {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: EntradaSenalRecibida): Promise<ResultadoRecepcion> {
    const { postulacionId, remitente, asunto, empresaDetectada, cargoDetectado, ...senal } = e;
    if (postulacionId) {
      const r = await new RegistrarSenal(this.c).ejecutar({
        id: postulacionId,
        ...senal,
        ...(remitente ? { remitente } : {}),
        ...(asunto ? { asunto } : {}),
      });
      return { destino: 'postulacion', ...r };
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
      },
      deps(this.c),
    );
    await this.c.bandeja.guardar(p, { tipo: 'senal.sin_asociar', prioridad: 'media' });
    return { destino: 'bandeja', pendiente: aVistaPendiente(p.datos()) };
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
  async ejecutar(e: { senalId: string; postulacionId: string }): Promise<VistaDetalle> {
    const pendiente = await pendienteOFalla(this.c, e.senalId);
    pendiente.asociar(e.postulacionId, this.c.reloj.ahora()); // valida que siga pendiente antes de tocar la postulación
    const [aplicarSeguras, umbral] = await Promise.all([
      this.c.ajustes.aplicarSenalesSeguras(),
      this.c.ajustes.umbralConfianza(),
    ]);
    await modificar(this.c, e.postulacionId, undefined, (p) =>
      p.registrarSenal(pendiente.comoSenal(), { ...deps(this.c), aplicarSeguras, umbral }),
    );
    await this.c.bandeja.guardar(pendiente);
    return detalleOFalla(this.c, e.postulacionId);
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
