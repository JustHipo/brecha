import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { Evento } from '@brecha/contratos';
import { Subject, type Observable } from 'rxjs';
import { SesionLocal } from '../acceso/sesion';

/**
 * Cliente del flujo SSE `GET /api/v1/eventos/stream` (ui.md §2). Usa `fetch` porque `EventSource`
 * no manda la cabecera Authorization. En F3 se cambia por Socket.IO sin tocar a quien lo usa.
 */
@Injectable({ providedIn: 'root' })
export class Eventos {
  private readonly sesion = inject(SesionLocal);
  private readonly sujeto = new Subject<Evento>();
  private control?: AbortController;
  readonly conectado = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detener());
  }

  /** Eventos de dominio recién guardados (no incluye los latidos). */
  flujo(): Observable<Evento> {
    if (!this.control) void this.conectar();
    return this.sujeto.asObservable();
  }

  detener(): void {
    this.control?.abort();
    this.control = undefined;
  }

  private async conectar(intento = 0): Promise<void> {
    this.control = new AbortController();
    const token = this.sesion.actual();
    try {
      const r = await fetch('/api/v1/eventos/stream', {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: this.control.signal,
      });
      if (!r.ok || !r.body) throw new Error(`SSE ${r.status}`);
      this.conectado.set(true);
      intento = 0;
      const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = '';
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += value;
        const bloques = resto.split('\n\n');
        resto = bloques.pop() ?? '';
        for (const b of bloques) this.procesar(b);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    this.conectado.set(false);
    if (!this.control?.signal.aborted) {
      const espera = Math.min(30_000, 1000 * 2 ** intento);
      setTimeout(() => void this.conectar(intento + 1), espera);
    }
  }

  private procesar(bloque: string): void {
    let tipo = 'message';
    let datos = '';
    for (const linea of bloque.split('\n')) {
      if (linea.startsWith('event:')) tipo = linea.slice(6).trim();
      else if (linea.startsWith('data:')) datos += linea.slice(5).trim();
    }
    if (tipo === 'latido' || !datos) return;
    try {
      this.sujeto.next(JSON.parse(datos) as Evento);
    } catch {
      /* bloque incompleto o ajeno: se ignora */
    }
  }
}
