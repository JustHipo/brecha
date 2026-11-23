import type { EventoDeDominio } from './evento-de-dominio';

export abstract class AggregateRoot {
  private eventos: EventoDeDominio[] = [];

  protected registrar(evento: EventoDeDominio): void {
    this.eventos.push(evento);
  }

  /** Entrega los eventos acumulados y los olvida (el repositorio los guarda en el outbox). */
  sacarEventos(): EventoDeDominio[] {
    const salida = this.eventos;
    this.eventos = [];
    return salida;
  }
}
