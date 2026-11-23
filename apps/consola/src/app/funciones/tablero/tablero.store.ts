import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  ColumnaTablero,
  Detalle,
  EstadoPostulacion,
  Resumen,
  Transicion,
} from '@brecha/contratos';
import { debounceTime, firstValueFrom } from 'rxjs';
import { Api } from '../../nucleo/api/api.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Eventos } from '../../nucleo/eventos/eventos.service';

export const ABIERTOS: EstadoPostulacion[] = [
  'sin_decidir',
  'por_postular',
  'postulado',
  'en_proceso',
  'entrevista',
  'oferta',
];
export const CERRADOS: EstadoPostulacion[] = ['aceptada', 'rechazado', 'descartado'];

export interface Filtros {
  plataformas: string[];
  prioridades: string[];
  q: string;
}

export type ResultadoMovimiento =
  { ok: true; detalle: Detalle; discrepanciaNueva: boolean } | { ok: false; error: ErrorDeApi };

const CAMPOS_RESUMEN: (keyof Resumen)[] = [
  'id',
  'titulo',
  'empresa',
  'url',
  'plataforma',
  'modalidad',
  'ubicacion',
  'cierre',
  'diasAlCierre',
  'estado',
  'prioridad',
  'fechaPostulacion',
  'senalesNuevas',
  'discrepanciasAbiertas',
  'transicionesPosibles',
  'version',
  'actualizadaEn',
];

export function aResumen(d: Detalle | Resumen): Resumen {
  return Object.fromEntries(CAMPOS_RESUMEN.map((k) => [k, d[k]])) as unknown as Resumen;
}

const PESO = { alta: 0, media: 1, baja: 2 } as const;
function ordenar(a: Resumen, b: Resumen): number {
  return (
    PESO[a.prioridad] - PESO[b.prioridad] ||
    (a.diasAlCierre ?? Number.MAX_SAFE_INTEGER) - (b.diasAlCierre ?? Number.MAX_SAFE_INTEGER) ||
    b.actualizadaEn.localeCompare(a.actualizadaEn)
  );
}

/**
 * Estado del tablero con signals (ui.md §2 y §4.2): movimiento optimista, vuelta atrás con 422,
 * recarga con 409 y refresco cuando llega un evento por el flujo SSE.
 */
@Injectable({ providedIn: 'root' })
export class TableroStore {
  private readonly api = inject(Api);
  private readonly eventos = inject(Eventos);

  readonly estado = signal<'inicial' | 'cargando' | 'listo' | 'error'>('inicial');
  readonly error = signal<ErrorDeApi | null>(null);
  readonly columnas = signal<ColumnaTablero[]>([]);
  readonly filtros = signal<Filtros>({ plataformas: [], prioridades: [], q: '' });

  readonly todas = computed(() => this.columnas().flatMap((c) => c.items));
  readonly total = computed(() => this.todas().length);
  readonly abiertas = computed(
    () => this.todas().filter((t) => ABIERTOS.includes(t.estado)).length,
  );
  readonly porRevisar = computed(
    () => this.todas().filter((t) => t.discrepanciasAbiertas > 0).length,
  );
  readonly porPlataforma = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.todas()) m.set(t.plataforma, (m.get(t.plataforma) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });
  readonly hayFiltros = computed(() => {
    const f = this.filtros();
    return f.plataformas.length > 0 || f.prioridades.length > 0 || f.q.trim() !== '';
  });

  /** Columnas con los filtros aplicados en el cliente (son pocas tarjetas). */
  readonly visibles = computed(() => {
    const f = this.filtros();
    const q = f.q.trim().toLowerCase();
    const pasa = (t: Resumen) =>
      (!f.plataformas.length || f.plataformas.includes(t.plataforma)) &&
      (!f.prioridades.length || f.prioridades.includes(t.prioridad)) &&
      (!q || `${t.empresa} ${t.titulo}`.toLowerCase().includes(q));
    return this.columnas().map((c) => ({ ...c, items: c.items.filter(pasa) }));
  });

  private suscrito = false;

  constructor() {
    const destroy = inject(DestroyRef);
    // Se suscribe al flujo en vivo una sola vez, con un pequeño retardo para agrupar eventos.
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
      const t = await firstValueFrom(this.api.tablero());
      this.columnas.set(t.columnas);
      this.error.set(null);
      this.estado.set('listo');
    } catch (e) {
      if (silencioso) return;
      this.error.set(e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0));
      this.estado.set('error');
    }
  }

  columna(estado: EstadoPostulacion): ColumnaTablero | undefined {
    return this.visibles().find((c) => c.estado === estado);
  }

  buscar(id: string): Resumen | undefined {
    return this.todas().find((t) => t.id === id);
  }

  /** Mueve en pantalla de inmediato y después llama a la API (ui.md §4.2, pasos 1 a 6). */
  async mover(
    tarjeta: Resumen,
    a: EstadoPostulacion,
    extra: Omit<Transicion, 'a' | 'version' | 'origen'> = {},
  ): Promise<ResultadoMovimiento> {
    const antes = this.columnas();
    this.columnas.set(this.colocar(antes, { ...tarjeta, estado: a }, tarjeta.estado));
    try {
      const detalle = await firstValueFrom(
        this.api.cambiarEstado(tarjeta.id, {
          ...extra,
          a,
          origen: 'tablero',
          version: tarjeta.version,
        }),
      );
      this.actualizar(detalle);
      return {
        ok: true,
        detalle,
        discrepanciaNueva: detalle.discrepanciasAbiertas > tarjeta.discrepanciasAbiertas,
      };
    } catch (e) {
      const error = e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0);
      if (error.codigo === 'CONFLICTO') await this.cargar(true);
      else this.columnas.set(antes);
      return { ok: false, error };
    }
  }

  /** Reemplaza una tarjeta con lo que respondió la API (detalle o resumen). */
  actualizar(d: Detalle | Resumen): void {
    const actual = this.buscar(d.id);
    this.columnas.set(this.colocar(this.columnas(), aResumen(d), actual?.estado));
  }

  private colocar(
    columnas: ColumnaTablero[],
    tarjeta: Resumen,
    desde?: EstadoPostulacion,
  ): ColumnaTablero[] {
    return columnas.map((c) => {
      let items = c.items;
      if (c.estado === desde || items.some((i) => i.id === tarjeta.id))
        items = items.filter((i) => i.id !== tarjeta.id);
      if (c.estado === tarjeta.estado) items = [...items, tarjeta].sort(ordenar);
      return { ...c, items, total: items.length };
    });
  }
}
