import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Ia, type AvisoIa } from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';

export const MINIMO = 3;
export const MAXIMO = 500;

export interface Intercambio {
  id: number;
  pregunta: string;
  estado: 'esperando' | 'lista' | 'error';
  respuesta?: string;
  citados: AvisoIa[];
  descartados: number;
  costoUsd: number;
  error?: ErrorDeApi;
}

/**
 * Preguntar (f2.md §7 y §8): conversación con la IA sobre tus avisos. Cada pregunta es independiente
 * (la API no guarda historial); la conversación vive mientras la consola esté abierta.
 */
@Injectable({ providedIn: 'root' })
export class PreguntarStore {
  private readonly ia = inject(Ia);
  private siguiente = 1;

  readonly intercambios = signal<Intercambio[]>([]);
  readonly esperando = computed(() => this.intercambios().some((i) => i.estado === 'esperando'));
  readonly costoTotal = computed(() =>
    this.intercambios().reduce((s, i) => s + (i.costoUsd ?? 0), 0),
  );

  /** La pregunta sirve si tiene entre 3 y 500 caracteres (los mismos límites que la API). */
  static valida(texto: string): boolean {
    const t = texto.trim();
    return t.length >= MINIMO && t.length <= MAXIMO;
  }

  async preguntar(texto: string): Promise<Intercambio | null> {
    const pregunta = texto.trim();
    if (!PreguntarStore.valida(pregunta) || this.esperando()) return null;
    const id = this.siguiente++;
    this.intercambios.update((xs) => [
      ...xs,
      { id, pregunta, estado: 'esperando', citados: [], descartados: 0, costoUsd: 0 },
    ]);
    let final: Intercambio;
    try {
      const r = await firstValueFrom(this.ia.preguntar(pregunta));
      final = {
        id,
        pregunta,
        estado: 'lista',
        respuesta: r.respuesta,
        citados: r.citados,
        descartados: r.descartados,
        costoUsd: r.costoUsd,
      };
    } catch (e) {
      final = {
        id,
        pregunta,
        estado: 'error',
        citados: [],
        descartados: 0,
        costoUsd: 0,
        error: e instanceof ErrorDeApi ? e : new ErrorDeApi('IA_APAGADA', String(e), 0),
      };
    }
    this.intercambios.update((xs) => xs.map((x) => (x.id === id ? final : x)));
    return final;
  }

  /** Vuelve a mandar una pregunta que falló. */
  reintentar(id: number): Promise<Intercambio | null> {
    const x = this.intercambios().find((i) => i.id === id);
    if (!x || x.estado !== 'error') return Promise.resolve(null);
    this.intercambios.update((xs) => xs.filter((i) => i.id !== id));
    return this.preguntar(x.pregunta);
  }

  limpiar(): void {
    this.intercambios.set([]);
  }
}
