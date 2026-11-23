import { Subject, type Observable } from 'rxjs';
import type { EventoGuardado, OyenteDeEventos } from '../../postulaciones/infraestructura/outbox/outbox';

/** Despachador local (backend.md §7): pasa al flujo SSE los eventos recién confirmados. */
export class FlujoDeEventos implements OyenteDeEventos {
  private readonly sujeto = new Subject<EventoGuardado>();
  publicar(eventos: EventoGuardado[]): void {
    for (const e of eventos) this.sujeto.next(e);
  }
  eventos(): Observable<EventoGuardado> {
    return this.sujeto.asObservable();
  }
}
