import type { Deps, GeneradorId, Reloj } from '../../compartido/dominio/puertos';
import { DatoInvalido, NoEncontrada } from '../../postulaciones/dominio/errores';
import {
  ContactoDeRed,
  perfilNormalizado,
  type EstadoDeConexion,
  type OrigenDeRed,
  type Pendiente,
  type RedRepositorio,
  type TipoDeInteraccion,
} from '../dominio/contacto-de-red';

export interface ContextoDeRed {
  red: RedRepositorio;
  reloj: Reloj;
  ids: GeneradorId;
  existePostulacion(id: string): Promise<boolean>;
}

export interface VistaInteraccion {
  id: string;
  tipo: TipoDeInteraccion;
  resumen: string;
  ocurridaEn: string;
  origen: OrigenDeRed;
}

export interface VistaContactoRed {
  id: string;
  nombre: string;
  perfilUrl: string;
  titular: string | null;
  empresa: string | null;
  conexion: EstadoDeConexion;
  pendiente: Pendiente;
  ultimaInteraccion: VistaInteraccion | null;
  diasDesdeUltima: number | null;
  seguimiento: string | null;
  seguimientoVencido: boolean;
  postulacionIds: string[];
  notas: string | null;
  actualizadoEn: string;
}

export interface VistaContactoRedDetalle extends VistaContactoRed {
  interacciones: VistaInteraccion[];
}

export const FILTROS_DE_RED = ['todos', 'responder', 'esperando', 'solicitudes', 'seguimiento'] as const;
export type FiltroDeRed = (typeof FILTROS_DE_RED)[number];

const deps = (c: ContextoDeRed): Deps => ({ reloj: c.reloj, ids: c.ids });
const DIA_MS = 86_400_000;

function vistaInteraccion(i: ReturnType<ContactoDeRed['datos']>['interacciones'][number]): VistaInteraccion {
  return {
    id: i.id,
    tipo: i.tipo,
    resumen: i.resumen,
    ocurridaEn: i.ocurridaEn.toISOString(),
    origen: i.origen,
  };
}

export function vista(c: ContactoDeRed, reloj: Reloj): VistaContactoRed {
  const d = c.datos();
  const ultima = c.ultimaInteraccion();
  return {
    id: d.id,
    nombre: d.nombre,
    perfilUrl: d.perfilUrl,
    titular: d.titular ?? null,
    empresa: d.empresa ?? null,
    conexion: d.conexion,
    pendiente: c.pendiente(),
    ultimaInteraccion: ultima ? vistaInteraccion(ultima) : null,
    diasDesdeUltima: ultima
      ? Math.floor((reloj.ahora().getTime() - ultima.ocurridaEn.getTime()) / DIA_MS)
      : null,
    seguimiento: d.seguimiento ?? null,
    seguimientoVencido: c.seguimientoVencido(reloj),
    postulacionIds: d.postulacionIds,
    notas: d.notas ?? null,
    actualizadoEn: d.actualizadoEn.toISOString(),
  };
}

export function detalle(c: ContactoDeRed, reloj: Reloj): VistaContactoRedDetalle {
  return { ...vista(c, reloj), interacciones: c.datos().interacciones.map(vistaInteraccion).reverse() };
}

async function cargar(c: ContextoDeRed, id: string): Promise<ContactoDeRed> {
  const x = await c.red.porId(id);
  if (!x) throw new NoEncontrada('El contacto');
  return x;
}

/** Crea el contacto o, si el perfil ya está, actualiza sus datos (la IA puede sincronizar las veces que quiera). */
export class RegistrarContacto {
  constructor(private readonly c: ContextoDeRed) {}
  async ejecutar(e: {
    nombre: string;
    perfilUrl: string;
    titular?: string;
    empresa?: string;
    postulacionId?: string;
  }): Promise<VistaContactoRedDetalle & { nuevo: boolean }> {
    const existente = await this.c.red.porPerfil(perfilNormalizado(e.perfilUrl));
    const contacto = existente ?? ContactoDeRed.crear(e, deps(this.c));
    if (existente) {
      existente.actualizar(
        {
          nombre: e.nombre,
          ...(e.titular ? { titular: e.titular } : {}),
          ...(e.empresa ? { empresa: e.empresa } : {}),
        },
        this.c.reloj,
      );
    }
    if (e.postulacionId) {
      if (!(await this.c.existePostulacion(e.postulacionId))) throw new NoEncontrada();
      contacto.vincularPostulacion(e.postulacionId, this.c.reloj);
    }
    await this.c.red.guardar(contacto);
    return { ...detalle(contacto, this.c.reloj), nuevo: !existente };
  }
}

export class RegistrarInteraccion {
  constructor(private readonly c: ContextoDeRed) {}

  private async contactoPara(e: {
    id?: string;
    perfilUrl?: string;
    nombre?: string;
  }): Promise<ContactoDeRed> {
    if (e.id) return cargar(this.c, e.id);
    if (!e.perfilUrl) throw new DatoInvalido('id', 'Hace falta el id del contacto o su perfil de LinkedIn');
    const existente = await this.c.red.porPerfil(perfilNormalizado(e.perfilUrl));
    if (existente) return existente;
    if (!e.nombre) throw new DatoInvalido('nombre', 'Para un contacto nuevo hace falta el nombre');
    return ContactoDeRed.crear({ nombre: e.nombre, perfilUrl: e.perfilUrl }, deps(this.c));
  }

  /** Por `id` o por `perfilUrl` (con `nombre`, crea el contacto si no existe). */
  async ejecutar(e: {
    id?: string;
    perfilUrl?: string;
    nombre?: string;
    tipo: string;
    resumen: string;
    ocurridaEn?: Date;
    referenciaExterna?: string;
    origen: OrigenDeRed;
  }): Promise<VistaContactoRedDetalle & { agregada: boolean }> {
    const contacto = await this.contactoPara(e);
    const agregada = contacto.registrarInteraccion(e, deps(this.c));
    await this.c.red.guardar(contacto);
    return { ...detalle(contacto, this.c.reloj), agregada };
  }
}

export class EditarContacto {
  constructor(private readonly c: ContextoDeRed) {}
  async ejecutar(e: {
    id: string;
    nombre?: string;
    titular?: string | null;
    empresa?: string | null;
    notas?: string | null;
    seguimiento?: string | null;
    vincular?: string;
    desvincular?: string;
  }): Promise<VistaContactoRedDetalle> {
    const contacto = await cargar(this.c, e.id);
    const { id: _id, vincular, desvincular, ...datos } = e;
    contacto.actualizar(datos, this.c.reloj);
    if (vincular) {
      if (!(await this.c.existePostulacion(vincular))) throw new NoEncontrada();
      contacto.vincularPostulacion(vincular, this.c.reloj);
    }
    if (desvincular) contacto.desvincularPostulacion(desvincular, this.c.reloj);
    await this.c.red.guardar(contacto);
    return detalle(contacto, this.c.reloj);
  }
}

export class VerContacto {
  constructor(private readonly c: ContextoDeRed) {}
  async ejecutar(id: string): Promise<VistaContactoRedDetalle> {
    return detalle(await cargar(this.c, id), this.c.reloj);
  }
}

export interface ResumenDeRed {
  total: number;
  conectados: number;
  porResponder: number;
  esperando: number;
  solicitudesEnviadas: number;
  seguimientosVencidos: number;
}

export class ListarRed {
  constructor(private readonly c: ContextoDeRed) {}
  async ejecutar(f: { filtro?: FiltroDeRed; texto?: string; postulacionId?: string } = {}): Promise<{
    items: VistaContactoRed[];
    resumen: ResumenDeRed;
  }> {
    const todas = (await this.c.red.todos()).map((x) => vista(x, this.c.reloj));
    const resumen: ResumenDeRed = {
      total: todas.length,
      conectados: todas.filter((v) => v.conexion === 'conectados').length,
      porResponder: todas.filter((v) => v.pendiente === 'responder').length,
      esperando: todas.filter((v) => v.pendiente === 'esperando').length,
      solicitudesEnviadas: todas.filter((v) => v.conexion === 'solicitud_enviada').length,
      seguimientosVencidos: todas.filter((v) => v.seguimientoVencido).length,
    };
    const texto = f.texto?.trim().toLowerCase();
    const items = todas
      .filter((v) => {
        switch (f.filtro ?? 'todos') {
          case 'responder':
            return v.pendiente === 'responder';
          case 'esperando':
            return v.pendiente === 'esperando';
          case 'solicitudes':
            return v.conexion === 'solicitud_enviada' || v.conexion === 'solicitud_recibida';
          case 'seguimiento':
            return v.seguimientoVencido;
          default:
            return true;
        }
      })
      .filter(
        (v) => !texto || `${v.nombre} ${v.empresa ?? ''} ${v.titular ?? ''}`.toLowerCase().includes(texto),
      )
      .filter((v) => !f.postulacionId || v.postulacionIds.includes(f.postulacionId))
      .sort(
        (a, b) =>
          Number(b.pendiente === 'responder') - Number(a.pendiente === 'responder') ||
          Number(b.seguimientoVencido) - Number(a.seguimientoVencido) ||
          (b.ultimaInteraccion?.ocurridaEn ?? '').localeCompare(a.ultimaInteraccion?.ocurridaEn ?? ''),
      );
    return { items, resumen };
  }
}

export class CasosDeRed {
  readonly registrarContacto: RegistrarContacto;
  readonly registrarInteraccion: RegistrarInteraccion;
  readonly editar: EditarContacto;
  readonly ver: VerContacto;
  readonly listar: ListarRed;
  constructor(c: ContextoDeRed) {
    this.registrarContacto = new RegistrarContacto(c);
    this.registrarInteraccion = new RegistrarInteraccion(c);
    this.editar = new EditarContacto(c);
    this.ver = new VerContacto(c);
    this.listar = new ListarRed(c);
  }
}
