import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Detalle } from '@brecha/contratos';
import { debounceTime, firstValueFrom } from 'rxjs';
import { Api, type AvisoEntrada, type SenalPendiente } from '../../nucleo/api/api.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Eventos } from '../../nucleo/eventos/eventos.service';
import { TableroStore } from '../tablero/tablero.store';

export type ResultadoBandeja = { ok: true; detalle: Detalle } | { ok: false; error: ErrorDeApi };

function aError(e: unknown): ErrorDeApi {
  return e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0);
}

/**
 * Bandeja (docs/diseno/f2.md §5 y §8): señales que llegaron sin postulación. Vive en la raíz porque
 * la barra lateral muestra cuántas quedan; se refresca cuando llega un evento por el flujo SSE.
 */
@Injectable({ providedIn: 'root' })
export class BandejaStore {
  private readonly api = inject(Api);
  private readonly eventos = inject(Eventos);
  private readonly tablero = inject(TableroStore);

  readonly estado = signal<'inicial' | 'cargando' | 'listo' | 'error'>('inicial');
  readonly error = signal<ErrorDeApi | null>(null);
  readonly senales = signal<SenalPendiente[]>([]);
  /** Ids de las señales con una acción en curso (para desactivar sus botones). */
  readonly ocupadas = signal<ReadonlySet<string>>(new Set());

  readonly pendientes = computed(() => this.senales().filter((s) => s.estado === 'pendiente'));
  readonly conteo = computed(() => this.pendientes().length);

  private suscrito = false;

  constructor() {
    const destroy = inject(DestroyRef);
    queueMicrotask(() => {
      if (this.suscrito) return;
      this.suscrito = true;
      this.eventos
        .flujo()
        .pipe(debounceTime(300), takeUntilDestroyed(destroy))
        .subscribe(() => void this.cargar(true));
    });
  }

  async cargar(silencioso = false): Promise<void> {
    if (!silencioso) this.estado.set('cargando');
    try {
      this.senales.set(await firstValueFrom(this.api.bandeja()));
      this.error.set(null);
      this.estado.set('listo');
    } catch (e) {
      if (silencioso) return;
      this.error.set(aError(e));
      this.estado.set('error');
    }
  }

  /** A una o varias postulaciones (pasos.md §7.3). */
  asociar(senal: SenalPendiente, postulacionIds: string[]): Promise<ResultadoBandeja> {
    return this.resolver(senal, () => this.api.asociarSenal(senal.id, postulacionIds));
  }

  crear(senal: SenalPendiente, aviso: AvisoEntrada): Promise<ResultadoBandeja> {
    return this.resolver(senal, () => this.api.crearDesdeSenal(senal.id, aviso));
  }

  async descartar(senal: SenalPendiente): Promise<{ ok: true } | { ok: false; error: ErrorDeApi }> {
    this.marcar(senal.id, true);
    try {
      await firstValueFrom(this.api.descartarSenal(senal.id));
      this.quitar(senal.id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: aError(e) };
    } finally {
      this.marcar(senal.id, false);
    }
  }

  /** Asociar o crear: si sale bien la señal deja la bandeja y la postulación queda al día en el tablero. */
  private async resolver(
    senal: SenalPendiente,
    llamar: () => ReturnType<Api['asociarSenal']>,
  ): Promise<ResultadoBandeja> {
    this.marcar(senal.id, true);
    try {
      const detalle = await firstValueFrom(llamar());
      this.quitar(senal.id);
      this.tablero.actualizar(detalle);
      return { ok: true, detalle };
    } catch (e) {
      const error = aError(e);
      // Si otra ventana ya la resolvió, la lista se pone al día.
      if (error.codigo === 'NO_ENCONTRADO' || error.codigo === 'CONFLICTO') await this.cargar(true);
      return { ok: false, error };
    } finally {
      this.marcar(senal.id, false);
    }
  }

  private quitar(id: string): void {
    this.senales.update((xs) => xs.filter((s) => s.id !== id));
  }

  private marcar(id: string, ocupada: boolean): void {
    this.ocupadas.update((s) => {
      const n = new Set(s);
      if (ocupada) n.add(id);
      else n.delete(id);
      return n;
    });
  }
}
