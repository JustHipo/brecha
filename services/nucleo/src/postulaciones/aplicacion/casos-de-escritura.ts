import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import type { Fecha } from '../../compartido/dominio/puertos';
import { DatoInvalido, SenalDuplicada } from '../dominio/errores';
import type { EstadoPostulacion } from '../dominio/estado';
import {
  crearAvisoResumen,
  crearCanal,
  crearDinero,
  type Origen,
  type Plataforma,
} from '../dominio/objetos-valor/valores';
import type { FuenteDeSenal, ResultadoDeEntrevista, Senal, TipoDeEntrevista } from '../dominio/partes';
import { Postulacion } from '../dominio/postulacion';
import { deps, detalleOFalla, modificar, type Contexto } from './base';
import type { VistaDetalle } from './vistas';

export interface EntradaCanal {
  tipo: string;
  valor: string;
}
export interface EntradaDinero {
  monto: number;
  moneda: string;
  periodo?: string;
  base?: string;
}

const canal = (c?: EntradaCanal) => (c ? crearCanal(c) : undefined);

export class CrearPostulacion {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    aviso: {
      titulo: string;
      empresa: string;
      url: string;
      plataforma: string;
      modalidad?: string;
      ubicacion?: string;
      cierre?: string | null;
      stack?: readonly string[];
      requisitos?: string;
      sueldoPublicado?: string;
    };
    estado?: EstadoPostulacion;
    etiquetas?: string[];
    prioridad?: Prioridad;
    sueldoPretendido?: EntradaDinero;
    fechaPostulacion?: Fecha;
    canal?: EntradaCanal;
    motivo?: string;
    origen: Origen;
  }): Promise<VistaDetalle> {
    const p = Postulacion.crear(
      {
        aviso: crearAvisoResumen(e.aviso),
        ...(e.estado ? { estado: e.estado } : {}),
        ...(e.sueldoPretendido ? { sueldoPretendido: crearDinero(e.sueldoPretendido) } : {}),
        ...(e.fechaPostulacion ? { fechaPostulacion: e.fechaPostulacion } : {}),
        ...(e.canal ? { canal: crearCanal(e.canal) } : {}),
        ...(e.motivo ? { motivo: e.motivo } : {}),
        ...(e.etiquetas ? { etiquetas: e.etiquetas } : {}),
        ...(e.prioridad ? { prioridadFijada: e.prioridad } : {}),
        origen: e.origen,
      },
      deps(this.c),
    );
    await this.c.repo.guardar(p);
    return detalleOFalla(this.c, p.id);
  }
}

export class CambiarEstado {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    id: string;
    a: EstadoPostulacion;
    motivo?: string;
    fechaPostulacion?: Fecha;
    canal?: EntradaCanal;
    origen: Origen;
    version?: number;
  }): Promise<VistaDetalle> {
    if (e.version === undefined && e.origen !== 'senal' && e.origen !== 'ia') {
      throw new DatoInvalido('version', 'Falta la versión de la postulación');
    }
    const c = canal(e.canal);
    await modificar(this.c, e.id, e.version, (p) =>
      p.cambiarEstado(
        e.a,
        {
          ...(e.motivo ? { motivo: e.motivo } : {}),
          ...(e.fechaPostulacion ? { fechaPostulacion: e.fechaPostulacion } : {}),
          ...(c ? { canal: c } : {}),
          origen: e.origen,
        },
        deps(this.c),
      ),
    );
    return detalleOFalla(this.c, e.id);
  }
}

export class EditarPostulacion {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    id: string;
    version: number;
    canal?: EntradaCanal;
    sueldoPretendido?: EntradaDinero | null;
    cierre?: Fecha | null;
    etiquetas?: string[];
    prioridad?: Prioridad | null;
    stack?: string[];
    requisitos?: string | null;
    sueldoPublicado?: string | null;
  }): Promise<VistaDetalle> {
    const cambios = {
      ...(e.etiquetas !== undefined ? { etiquetas: e.etiquetas } : {}),
      ...(e.prioridad !== undefined ? { prioridad: e.prioridad } : {}),
      ...(e.stack !== undefined ? { stack: e.stack } : {}),
      ...(e.requisitos !== undefined ? { requisitos: e.requisitos } : {}),
      ...(e.sueldoPublicado !== undefined ? { sueldoPublicado: e.sueldoPublicado } : {}),
      ...(e.canal ? { canal: crearCanal(e.canal) } : {}),
      ...(e.sueldoPretendido === null
        ? { sueldoPretendido: null }
        : e.sueldoPretendido
          ? { sueldoPretendido: crearDinero(e.sueldoPretendido) }
          : {}),
      ...(e.cierre !== undefined ? { cierre: e.cierre } : {}),
    };
    await modificar(this.c, e.id, e.version, (p) => p.editar(cambios, this.c.reloj));
    return detalleOFalla(this.c, e.id);
  }
}

export class RegistrarSenal {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    id: string;
    fuente: FuenteDeSenal;
    plataforma?: Plataforma;
    resumen: string;
    estadoSugerido?: EstadoPostulacion;
    confianza: number;
    recibidaEn?: Date;
    referenciaExterna?: string;
    remitente?: string;
    asunto?: string;
  }): Promise<{ senal: Senal; postulacion: VistaDetalle }> {
    const [aplicarSeguras, umbral] = await Promise.all([
      this.c.ajustes.aplicarSenalesSeguras(),
      this.c.ajustes.umbralConfianza(),
    ]);
    const { id, ...datos } = e;
    // La referencia externa no se repite ni en las postulaciones ni en la bandeja (ADR 0015).
    if (datos.referenciaExterna && (await this.c.bandeja.referenciaUsada(datos.referenciaExterna))) {
      throw new SenalDuplicada(datos.referenciaExterna);
    }
    const senal = await modificar(this.c, id, undefined, (p) =>
      p.registrarSenal(datos, { ...deps(this.c), aplicarSeguras, umbral }),
    );
    return { senal, postulacion: await detalleOFalla(this.c, id) };
  }
}

export class AplicarSenal {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: { id: string; senalId: string; version?: number }): Promise<VistaDetalle> {
    await modificar(this.c, e.id, e.version, (p) => p.aplicarSenal(e.senalId, deps(this.c)));
    return detalleOFalla(this.c, e.id);
  }
}

export class ResolverDiscrepancia {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    id: string;
    discrepanciaId: string;
    decision: 'confirmar' | 'corregir';
    a?: EstadoPostulacion;
    motivo?: string;
    fechaPostulacion?: Fecha;
    canal?: EntradaCanal;
    origen?: Origen;
    version?: number;
  }): Promise<VistaDetalle> {
    const c = canal(e.canal);
    const correccion = e.a
      ? {
          a: e.a,
          ...(e.motivo ? { motivo: e.motivo } : {}),
          ...(e.fechaPostulacion ? { fechaPostulacion: e.fechaPostulacion } : {}),
          ...(c ? { canal: c } : {}),
          ...(e.origen ? { origen: e.origen } : {}),
        }
      : undefined;
    await modificar(this.c, e.id, e.version, (p) =>
      p.resolverDiscrepancia(e.discrepanciaId, e.decision, correccion, deps(this.c)),
    );
    return detalleOFalla(this.c, e.id);
  }
}

export class AgregarNota {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: { id: string; texto: string }): Promise<VistaDetalle> {
    await modificar(this.c, e.id, undefined, (p) => p.agregarNota(e.texto, deps(this.c)));
    return detalleOFalla(this.c, e.id);
  }
}

export class AgregarContacto {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    id: string;
    nombre: string;
    rol?: string;
    email?: string;
    linkedin?: string;
  }): Promise<VistaDetalle> {
    const { id, ...datos } = e;
    await modificar(this.c, id, undefined, (p) => p.agregarContacto(datos, deps(this.c)));
    return detalleOFalla(this.c, id);
  }
}

export class AgendarEntrevista {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    id: string;
    fecha: string;
    tipo: TipoDeEntrevista;
    con?: string;
    origen: Origen;
  }): Promise<VistaDetalle> {
    const fecha = new Date(e.fecha);
    if (Number.isNaN(fecha.getTime()))
      throw new DatoInvalido('fecha', 'La fecha de la entrevista no es válida');
    await modificar(this.c, e.id, undefined, (p) =>
      p.agendarEntrevista(
        { fecha, tipo: e.tipo, ...(e.con ? { con: e.con } : {}), origen: e.origen },
        deps(this.c),
      ),
    );
    return detalleOFalla(this.c, e.id);
  }
}

export class RegistrarResultadoEntrevista {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    id: string;
    entrevistaId: string;
    resultado: ResultadoDeEntrevista;
  }): Promise<VistaDetalle> {
    await modificar(this.c, e.id, undefined, (p) =>
      p.registrarResultadoEntrevista(e.entrevistaId, e.resultado, this.c.reloj),
    );
    return detalleOFalla(this.c, e.id);
  }
}

export class VincularAviso {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: { id: string; avisoId?: string; calce?: number }): Promise<VistaDetalle> {
    await modificar(this.c, e.id, undefined, (p) =>
      p.vincularAviso(
        {
          ...(e.avisoId ? { avisoId: e.avisoId } : {}),
          ...(e.calce !== undefined ? { calce: e.calce } : {}),
        },
        this.c.reloj,
      ),
    );
    return detalleOFalla(this.c, e.id);
  }
}
