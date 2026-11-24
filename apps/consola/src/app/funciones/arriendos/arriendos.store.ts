import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter, firstValueFrom } from 'rxjs';
import {
  ApiArriendos,
  type Canal,
  type CambiarEstadoPropiedad,
  type EstadoPropiedad,
  type Propiedad,
  type PropiedadDetalle,
  type ResumenArriendos,
  type SenalArriendoPendiente,
} from '../../nucleo/api/arriendos.api';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Eventos } from '../../nucleo/eventos/eventos.service';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: ErrorDeApi };

export function aError(e: unknown): ErrorDeApi {
  return e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0);
}

/** Columnas del tablero de Arriendos, en el orden del embudo (P6). */
export const ABIERTOS: EstadoPropiedad[] = [
  'vista',
  'contactada',
  'visita_agendada',
  'visitada',
  'en_evaluacion',
  'aprobada',
];
export const CERRADOS: EstadoPropiedad[] = [
  'arrendada',
  'rechazada',
  'descartada',
  'no_disponible',
];

/** Piden algo al mover: motivo, fecha de la visita o documentos enviados. */
export const PIDEN_MOTIVO: EstadoPropiedad[] = ['rechazada', 'descartada', 'no_disponible'];

/**
 * Lo de Arriendos que necesita la barra lateral y varias pantallas: propiedades con su calce, resumen,
 * Bandeja y canales. Se pone al día solo con el flujo de eventos (cuando tu IA cambia algo por MCP).
 */
@Injectable({ providedIn: 'root' })
export class ArriendosStore {
  private readonly api = inject(ApiArriendos);
  private readonly eventos = inject(Eventos, { optional: true });

  readonly estado = signal<'inicial' | 'cargando' | 'listo' | 'error'>('inicial');
  readonly error = signal<ErrorDeApi | null>(null);
  readonly todas = signal<Propiedad[]>([]);
  readonly resumen = signal<ResumenArriendos | null>(null);
  readonly bandeja = signal<SenalArriendoPendiente[]>([]);
  readonly canales = signal<Canal[]>([]);
  readonly texto = signal('');
  readonly canal = signal('');

  /** Lo que el selector de foco cuenta: te toca responder y señales sin propiedad. */
  readonly porRevisar = computed(
    () => (this.resumen()?.porResponder ?? 0) + (this.resumen()?.bandeja ?? 0),
  );
  readonly filtradas = computed(() => {
    const q = this.texto().trim().toLowerCase();
    const c = this.canal();
    return this.todas().filter(
      (p) =>
        (!c || p.canales.includes(c)) &&
        (!q || `${p.titulo} ${p.comuna ?? ''} ${p.direccion ?? ''}`.toLowerCase().includes(q)),
    );
  });
  readonly nombreCanal = computed(() => {
    const m = new Map(this.canales().map((c) => [c.id, c.nombre]));
    return (id: string) => m.get(id) ?? id;
  });

  private turno = 0;

  constructor() {
    const destroy = inject(DestroyRef);
    queueMicrotask(() =>
      this.eventos
        ?.flujo()
        .pipe(
          filter((e) => e.tipo.startsWith('propiedad.') || e.tipo.startsWith('arriendos.')),
          debounceTime(300),
          takeUntilDestroyed(destroy),
        )
        .subscribe(() => void this.cargar(true)),
    );
  }

  columna(e: EstadoPropiedad): Propiedad[] {
    return this.filtradas().filter((p) => p.estado === e);
  }

  async cargar(silencioso = false): Promise<void> {
    const turno = ++this.turno;
    if (!silencioso) this.estado.set('cargando');
    try {
      const [lista, bandeja, canales] = await Promise.all([
        firstValueFrom(this.api.listar()),
        firstValueFrom(this.api.bandeja()),
        firstValueFrom(this.api.canales()),
      ]);
      if (turno !== this.turno) return;
      this.todas.set(lista.items);
      this.resumen.set(lista.resumen);
      this.bandeja.set(bandeja);
      this.canales.set(canales);
      this.error.set(null);
      this.estado.set('listo');
    } catch (e) {
      if (turno !== this.turno) return;
      this.error.set(aError(e));
      if (!silencioso) this.estado.set('error');
    }
  }

  /** Mueve con la tarjeta ya en la columna nueva; si la API lo rechaza, vuelve (optimista). */
  async mover(p: Propiedad, cuerpo: CambiarEstadoPropiedad): Promise<Resultado<PropiedadDetalle>> {
    const antes = this.todas();
    this.todas.set(
      antes.map((x) => (x.id === p.id ? { ...x, estado: cuerpo.a as EstadoPropiedad } : x)),
    );
    try {
      const d = await firstValueFrom(
        this.api.cambiarEstado(p.id, { ...cuerpo, version: p.version }),
      );
      this.todas.update((xs) => xs.map((x) => (x.id === d.id ? { ...x, ...vistaDe(d) } : x)));
      void this.cargar(true);
      return { ok: true, valor: d };
    } catch (e) {
      this.todas.set(antes);
      return { ok: false, error: aError(e) };
    }
  }
}

/** La parte de lista de un detalle (para actualizar la tarjeta sin recargar todo). */
export function vistaDe(d: PropiedadDetalle): Propiedad {
  return { ...d, cantidadContactos: d.contactos.length };
}
