import type { Deps, GeneradorId, Reloj } from '../../compartido/dominio/puertos';
import { ConflictoDeVersion, NoEncontrada } from '../dominio/errores';
import type { Postulacion } from '../dominio/postulacion';
import type { PostulacionRepositorio } from '../dominio/postulacion.repositorio';
import type { BandejaRepositorio } from '../dominio/senal-pendiente';
import type { Ajustes, ConsultasDePostulaciones } from './puertos';
import type { VistaDetalle } from './vistas';

export interface Contexto {
  repo: PostulacionRepositorio;
  bandeja: BandejaRepositorio;
  consultas: ConsultasDePostulaciones;
  reloj: Reloj;
  ids: GeneradorId;
  ajustes: Ajustes;
}

export function deps(c: Contexto): Deps {
  return { reloj: c.reloj, ids: c.ids };
}

export async function detalleOFalla(c: Contexto, id: string): Promise<VistaDetalle> {
  const d = await c.consultas.detalle(id);
  if (!d) throw new NoEncontrada();
  return d;
}

/**
 * Carga, modifica y guarda un agregado. Si viene `version` y no coincide, `CONFLICTO` al tiro.
 * Sin `version` (operaciones que solo agregan, o el vigía con origen `senal`) reintenta una vez.
 */
export async function modificar<R>(
  c: Contexto,
  id: string,
  version: number | undefined,
  cambio: (p: Postulacion) => R | Promise<R>,
): Promise<R> {
  const intentos = version === undefined ? 2 : 1;
  for (let i = 1; ; i++) {
    const p = await c.repo.porId(id);
    if (!p) throw new NoEncontrada();
    if (version !== undefined && p.version !== version) throw new ConflictoDeVersion();
    const r = await cambio(p);
    try {
      await c.repo.guardar(p);
      return r;
    } catch (e) {
      if (e instanceof ConflictoDeVersion && i < intentos) continue;
      throw e;
    }
  }
}
