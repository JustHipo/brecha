import type { Fecha } from '../../compartido/dominio/puertos';
import { DatoInvalido } from '../dominio/errores';
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
    };
    estado?: EstadoPostulacion;
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
  }): Promise<VistaDetalle> {
    const cambios = {
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
  }): Promise<{ senal: Senal; postulacion: VistaDetalle }> {
    const [aplicarSeguras, umbral] = await Promise.all([
      this.c.ajustes.aplicarSenalesSeguras(),
      this.c.ajustes.umbralConfianza(),
    ]);
    const { id, ...datos } = e;
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
