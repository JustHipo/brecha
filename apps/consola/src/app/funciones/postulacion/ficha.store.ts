import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Detalle } from '@brecha/contratos';
import { filter, firstValueFrom, type Observable } from 'rxjs';
import { Api } from '../../nucleo/api/api.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Eventos } from '../../nucleo/eventos/eventos.service';
import { TableroStore } from '../tablero/tablero.store';

/** Estado de la ficha (ui.md §2 y §4.4). Se refresca sola si llega un evento de esta postulación. */
@Injectable()
export class FichaStore {
  private readonly api = inject(Api);
  private readonly tablero = inject(TableroStore);
  readonly detalle = signal<Detalle | null>(null);
  readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  readonly error = signal<ErrorDeApi | null>(null);
  readonly ocupado = signal(false);
  readonly discrepanciasAbiertas = computed(
    () => this.detalle()?.discrepancias.filter((d) => d.estado === 'abierta') ?? [],
  );
  private id = '';

  constructor() {
    inject(Eventos)
      .flujo()
      .pipe(
        filter((e) => (e.datos as { postulacionId?: string }).postulacionId === this.id),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => void this.cargar(this.id, true));
  }

  async cargar(id: string, silencioso = false): Promise<void> {
    this.id = id;
    if (!silencioso) this.estado.set('cargando');
    try {
      this.detalle.set(await firstValueFrom(this.api.ver(id)));
      this.estado.set('listo');
    } catch (e) {
      if (silencioso) return;
      this.error.set(e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0));
      this.estado.set('error');
    }
  }

  /** Corre una acción contra la API y deja la ficha y el tablero con lo que respondió. */
  async ejecutar(accion: (d: Detalle) => Observable<Detalle>): Promise<Detalle> {
    const d = this.detalle();
    if (!d) throw new Error('Sin ficha cargada');
    this.ocupado.set(true);
    try {
      const nuevo = await firstValueFrom(accion(d));
      this.detalle.set(nuevo);
      this.tablero.actualizar(nuevo);
      return nuevo;
    } catch (e) {
      if (e instanceof ErrorDeApi && e.codigo === 'CONFLICTO') await this.cargar(d.id, true);
      throw e;
    } finally {
      this.ocupado.set(false);
    }
  }
}
