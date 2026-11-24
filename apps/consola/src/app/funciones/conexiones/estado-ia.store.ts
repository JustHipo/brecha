import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { Ia, type Conexiones } from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';

/** Cada cuánto se vuelve a preguntar el estado, y lo mínimo entre dos preguntas al navegar. */
export const CADA_MS = 60_000;
export const MINIMO_MS = 15_000;

export type Indicador =
  'cargando' | 'lista' | 'sin_configurar' | 'no_disponible' | 'apagada' | 'error';

/**
 * Estado de la IA para el indicador de la barra superior y la pantalla Conexiones (ui.md §5).
 * Pregunta `GET /api/ia/conexiones` cada 60 s y al navegar si pasaron más de 15 s: no satura.
 */
@Injectable({ providedIn: 'root' })
export class EstadoIaStore {
  private readonly ia = inject(Ia);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);

  readonly conexiones = signal<Conexiones | null>(null);
  readonly error = signal<ErrorDeApi | null>(null);
  readonly cargando = signal(false);
  private ultima = 0;
  private iniciado = false;

  /** El servicio con IA no respondió (apagado o caído). */
  readonly apagada = computed(() => this.error()?.codigo === 'IA_APAGADA');

  readonly indicador = computed<Indicador>(() => {
    const c = this.conexiones();
    if (this.apagada()) return 'apagada';
    if (this.error()) return 'error';
    if (!c) return 'cargando';
    if (!c.ia.configurado || !c.correo.configurado) return 'sin_configurar';
    return c.ia.ultimoError ? 'no_disponible' : 'lista';
  });

  readonly enCola = computed(() => this.conexiones()?.ia.enCola ?? 0);

  /** Arranca el sondeo (lo llama el marco una vez). */
  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;
    void this.cargar();
    const id = setInterval(() => void this.cargar(), CADA_MS);
    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      if (Date.now() - this.ultima >= MINIMO_MS) void this.cargar();
    });
    this.destroy.onDestroy(() => {
      clearInterval(id);
      sub.unsubscribe();
    });
  }

  async cargar(): Promise<void> {
    if (this.cargando()) return;
    this.cargando.set(true);
    this.ultima = Date.now();
    try {
      this.conexiones.set(await firstValueFrom(this.ia.conexiones()));
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof ErrorDeApi ? e : new ErrorDeApi('IA_APAGADA', String(e), 0));
    } finally {
      this.cargando.set(false);
    }
  }
}
