import type { Reloj } from '../../compartido/dominio/puertos';
import { ConflictoDeVersion, DatoInvalido, NoEncontrada } from '../dominio/errores';
import { estaCerrada, type EstadoPostulacion } from '../dominio/estado';
import type { Origen } from '../dominio/objetos-valor/valores';
import {
  Paso,
  type CerradorDePaso,
  type EstadoDePaso,
  type FuenteDePaso,
  type PasoRepositorio,
  type PropuestaDePaso,
  type RegistradorDePaso,
} from '../dominio/paso';
import { deps, type Contexto } from './base';
import type { VistaPaso } from './vistas';

export interface EntradaPaso {
  postulacionIds: string[];
  descripcion: string;
  detalle?: string;
  plazo?: string;
  enlace?: string;
  estado?: 'pendiente' | 'hecho';
  fuente?: FuenteDePaso;
  registradoPor: RegistradorDePaso;
  contactoRedId?: string;
  referenciaExterna?: string;
  pedidoEn?: Date;
  nota?: string;
}

async function vistaOFalla(c: Contexto, id: string): Promise<VistaPaso> {
  const v = await c.consultas.paso(id);
  if (!v) throw new NoEncontrada('El paso');
  return v;
}

async function pasoOFalla(c: Contexto, id: string): Promise<Paso> {
  const p = await c.pasos.porId(id);
  if (!p) throw new NoEncontrada('El paso');
  return p;
}

/** Todas las postulaciones deben existir (abiertas o cerradas, R15 y R18). */
async function exigirPostulaciones(pasos: PasoRepositorio, ids: readonly string[]) {
  const estados = await pasos.estadosDePostulaciones(ids);
  const falta = ids.find((id) => !estados.has(id));
  if (falta) throw new NoEncontrada(`La postulación ${falta}`);
  return estados;
}

/**
 * Crea un paso (a mano, por MCP o desde el lector de correo). Idempotente por `referenciaExterna`
 * (R19): si ese correo o mensaje ya creó uno, devuelve el que estaba.
 */
export class RegistrarPaso {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: EntradaPaso): Promise<VistaPaso & { yaEstaba: boolean }> {
    if (e.referenciaExterna) {
      const previo = await this.c.pasos.porReferencia(e.referenciaExterna.trim());
      if (previo) return { ...(await vistaOFalla(this.c, previo.id)), yaEstaba: true };
    }
    const paso = Paso.crear({ ...e, fuente: e.fuente ?? 'persona' }, deps(this.c));
    await exigirPostulaciones(this.c.pasos, paso.postulacionIds);
    await this.c.pasos.guardar(paso);
    return { ...(await vistaOFalla(this.c, paso.id)), yaEstaba: false };
  }
}

export class ListarPasos {
  constructor(private readonly c: Contexto) {}
  ejecutar(f: { estado?: EstadoDePaso; postulacionId?: string } = {}): Promise<VistaPaso[]> {
    return this.c.consultas.pasos(f);
  }
}

export class ResolverPaso {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    id: string;
    estado: EstadoDePaso;
    por: CerradorDePaso;
    nota?: string;
    version?: number;
  }): Promise<VistaPaso> {
    const paso = await pasoOFalla(this.c, e.id);
    if (e.version !== undefined && e.version !== paso.version) throw new ConflictoDeVersion();
    paso.resolver(e.estado, { por: e.por, ...(e.nota ? { nota: e.nota } : {}) }, this.c.reloj);
    await this.c.pasos.guardar(paso);
    return vistaOFalla(this.c, e.id);
  }
}

export class EditarPaso {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    id: string;
    version: number;
    descripcion?: string;
    detalle?: string | null;
    plazo?: string | null;
    enlace?: string | null;
    postulacionIds?: string[];
  }): Promise<VistaPaso> {
    const { id, version, ...cambios } = e;
    const paso = await pasoOFalla(this.c, id);
    if (version !== paso.version) throw new ConflictoDeVersion();
    paso.editar(cambios, this.c.reloj);
    if (cambios.postulacionIds) await exigirPostulaciones(this.c.pasos, paso.postulacionIds);
    await this.c.pasos.guardar(paso);
    return vistaOFalla(this.c, id);
  }
}

/** Quién cierra cuando el que actúa es un cambio de estado con cierto origen. */
export function cerradorDe(origen: Origen): CerradorDePaso {
  if (origen === 'ia') return 'ia';
  if (origen === 'senal' || origen === 'importacion') return 'sistema';
  return 'persona';
}

/**
 * R17: al cerrar una postulación los pasos no se descartan solos. Si la persona lo pide (el diálogo
 * de cerrar lo trae marcado), se descartan los pendientes que solo tocan postulaciones cerradas.
 */
export async function descartarPasosDeCerrada(
  pasos: PasoRepositorio,
  postulacionId: string,
  por: CerradorDePaso,
  reloj: Reloj,
): Promise<number> {
  const pendientes = (await pasos.deLasPostulaciones([postulacionId])).filter(
    (p) => p.estado === 'pendiente',
  );
  if (!pendientes.length) return 0;
  const estados = await pasos.estadosDePostulaciones([
    ...new Set(pendientes.flatMap((p) => p.postulacionIds)),
  ]);
  let n = 0;
  for (const p of pendientes) {
    const todasCerradas = p.postulacionIds.every((id) => {
      const e = estados.get(id);
      return e === undefined || estaCerrada(e as EstadoPostulacion);
    });
    if (!todasCerradas) continue;
    p.resolver('descartado', { por, nota: 'La postulación se cerró' }, reloj);
    await pasos.guardar(p);
    n += 1;
  }
  return n;
}

/**
 * El paso que pide un correo (docs/diseno/pasos.md §5.2). `mismoQue` = el correo solo recuerda un
 * paso pendiente: se actualiza en vez de crear otro (R19).
 */
export async function pasoDeCorreo(
  c: Contexto,
  e: {
    postulacionIds: string[];
    paso: PropuestaDePaso & { mismoQue?: string };
    fuente: FuenteDePaso;
    registradoPor: RegistradorDePaso;
    referenciaExterna?: string;
    pedidoEn: Date;
  },
): Promise<{ paso: VistaPaso; accion: 'creado' | 'recordado' | 'ya_estaba' }> {
  if (e.paso.mismoQue) {
    const previo = await c.pasos.porId(e.paso.mismoQue);
    if (previo && previo.estado === 'pendiente' && previo.toca(e.postulacionIds)) {
      previo.recordar(e.paso, c.reloj);
      await c.pasos.guardar(previo);
      return { paso: await vistaOFalla(c, previo.id), accion: 'recordado' };
    }
  }
  const { mismoQue: _mismoQue, ...propuesta } = e.paso;
  const r = await new RegistrarPaso(c).ejecutar({
    ...propuesta,
    postulacionIds: e.postulacionIds,
    fuente: e.fuente,
    registradoPor: e.registradoPor,
    ...(e.referenciaExterna ? { referenciaExterna: e.referenciaExterna } : {}),
    pedidoEn: e.pedidoEn,
  });
  const { yaEstaba, ...paso } = r;
  return { paso, accion: yaEstaba ? 'ya_estaba' : 'creado' };
}

/** R20: los pasos que un correo da por hechos. Solo los de las postulaciones de ese correo. */
export async function cerrarCumplidos(
  c: Contexto,
  e: {
    postulacionIds: string[];
    cumplidos: { id: string; confianza: number }[];
    referenciaExterna?: string;
  },
): Promise<{ cerrados: string[]; sugeridos: string[] }> {
  const umbral = await c.ajustes.umbralConfianza();
  const r = { cerrados: [] as string[], sugeridos: [] as string[] };
  for (const x of e.cumplidos) {
    if (typeof x.confianza !== 'number' || x.confianza < 0 || x.confianza > 1)
      throw new DatoInvalido('pasosCumplidos', 'La confianza va de 0 a 1');
    const paso = await c.pasos.porId(x.id);
    if (!paso || !paso.toca(e.postulacionIds)) continue;
    const resultado = paso.cumplidoPorCorreo(x.confianza, umbral, e.referenciaExterna, c.reloj);
    if (resultado === 'ignorado') continue;
    await c.pasos.guardar(paso);
    (resultado === 'cerrado' ? r.cerrados : r.sugeridos).push(paso.id);
  }
  return r;
}
