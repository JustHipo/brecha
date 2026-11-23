import type { EventoDeDominio } from '../../../compartido/dominio/evento-de-dominio';
import type { GeneradorId } from '../../../compartido/dominio/puertos';

/** Evento tal como queda en el outbox y como sale por el flujo SSE (sobre de PLAN §12.4). */
export interface EventoGuardado {
  id: string;
  tipo: string;
  version: number;
  ocurridoEn: string;
  prioridad: string;
  correlacionId: string | null;
  datos: object;
}

/** Recibe los eventos recién confirmados (el despachador local del flujo SSE). */
export interface OyenteDeEventos {
  publicar(eventos: EventoGuardado[]): void;
}

export function aEventosGuardados(
  eventos: EventoDeDominio[],
  ids: GeneradorId,
  correlacionId: string | null,
): EventoGuardado[] {
  return eventos.map((e) => ({
    id: ids.nuevo(),
    tipo: e.tipo,
    version: e.version,
    ocurridoEn: e.ocurridoEn.toISOString(),
    prioridad: e.prioridad,
    correlacionId,
    datos: e.datos,
  }));
}

export function aFilasOutbox(eventos: EventoGuardado[]) {
  return eventos.map((e) => ({
    id: e.id,
    tipo: e.tipo,
    version: e.version,
    prioridad: e.prioridad,
    datos: JSON.parse(JSON.stringify(e.datos)) as object,
    correlacionId: e.correlacionId,
    ocurridoEn: new Date(e.ocurridoEn),
  }));
}
