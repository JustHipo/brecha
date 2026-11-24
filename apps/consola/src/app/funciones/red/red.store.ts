import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter, firstValueFrom } from 'rxjs';
import { Eventos } from '../../nucleo/eventos/eventos.service';
import {
  Api,
  type ContactoRed,
  type ContactoRedDetalle,
  type ContactoRedEntrada,
  type ContactoRedRegistrado,
  type EditarContactoRed,
  type FiltroDeRed,
  type InteraccionEntrada,
  type ResumenDeRed,
} from '../../nucleo/api/api.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: ErrorDeApi };

export function aError(e: unknown): ErrorDeApi {
  return e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0);
}

/** Orden de los filtros en pantalla: primero lo que pide algo de ti. */
export const FILTROS: FiltroDeRed[] = [
  'responder',
  'esperando',
  'solicitudes',
  'seguimiento',
  'todos',
];

/** Fecha y hora para `ocurridaEn`: hoy es ahora; otro día, el mediodía local de ese día. */
export function momentoDe(fecha: string, ahora = new Date()): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const mismoDia =
    d.getFullYear() === ahora.getFullYear() &&
    d.getMonth() === ahora.getMonth() &&
    d.getDate() === ahora.getDate();
  return (mismoDia || d > ahora ? ahora : d).toISOString();
}

/**
 * Tu red de LinkedIn (f2.md §8): personas, solicitudes y mensajes ligados a tus postulaciones.
 * Vive en la raíz porque la barra lateral muestra a cuántas personas les debes una respuesta.
 * LinkedIn no tiene API: la IA la mantiene al día por MCP y tú puedes corregirla aquí.
 */
@Injectable({ providedIn: 'root' })
export class RedStore {
  private readonly api = inject(Api);

  private readonly eventos = inject(Eventos, { optional: true });

  constructor() {
    // Cuando tu IA registra algo por MCP, el núcleo avisa por el flujo SSE y la lista se pone al día.
    const destroy = inject(DestroyRef);
    queueMicrotask(() =>
      this.eventos
        ?.flujo()
        .pipe(
          filter((e) => e.tipo.startsWith('red.')),
          debounceTime(300),
          takeUntilDestroyed(destroy),
        )
        .subscribe(() => void this.cargar(true)),
    );
  }

  readonly estado = signal<'inicial' | 'cargando' | 'listo' | 'error'>('inicial');
  readonly error = signal<ErrorDeApi | null>(null);
  readonly items = signal<ContactoRed[]>([]);
  readonly resumen = signal<ResumenDeRed | null>(null);
  readonly filtro = signal<FiltroDeRed>('todos');
  readonly texto = signal('');

  /** Personas a las que les toca tu respuesta (contador de la barra lateral). */
  readonly porResponder = computed(() => this.resumen()?.porResponder ?? 0);
  readonly vacia = computed(() => (this.resumen()?.total ?? 0) === 0);

  private turno = 0;

  async cargar(silencioso = false): Promise<void> {
    const turno = ++this.turno;
    if (!silencioso) this.estado.set('cargando');
    try {
      const r = await firstValueFrom(
        this.api.red({ filtro: this.filtro(), texto: this.texto().trim() }),
      );
      if (turno !== this.turno) return;
      this.items.set(r.items);
      this.resumen.set(r.resumen);
      this.error.set(null);
      this.estado.set('listo');
    } catch (e) {
      if (turno !== this.turno || silencioso) return;
      this.error.set(aError(e));
      this.estado.set('error');
    }
  }

  filtrar(filtro: FiltroDeRed): Promise<void> {
    this.filtro.set(filtro);
    return this.cargar();
  }

  buscar(texto: string): Promise<void> {
    this.texto.set(texto);
    return this.cargar(true);
  }

  /** Crea el contacto (o pone al día el del mismo perfil) y refresca la lista. */
  async registrar(entrada: ContactoRedEntrada): Promise<Resultado<ContactoRedRegistrado>> {
    try {
      const valor = await firstValueFrom(this.api.registrarContactoRed(entrada));
      await this.cargar(true);
      return { ok: true, valor };
    } catch (e) {
      return { ok: false, error: aError(e) };
    }
  }

  /** Después de editar un contacto: reemplaza su fila y pone al día los conteos. */
  async reemplazar(c: ContactoRed): Promise<void> {
    this.items.update((xs) => xs.map((x) => (x.id === c.id ? { ...x, ...c } : x)));
    await this.cargar(true);
  }
}

/** Detalle de un contacto: línea de tiempo, notas, seguimiento y postulaciones ligadas. */
@Injectable()
export class ContactoStore {
  private readonly api = inject(Api);
  private readonly red = inject(RedStore);

  readonly detalle = signal<ContactoRedDetalle | null>(null);
  readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  readonly error = signal<ErrorDeApi | null>(null);
  readonly ocupado = signal(false);

  async cargar(id: string): Promise<void> {
    this.estado.set('cargando');
    try {
      this.detalle.set(await firstValueFrom(this.api.verContactoRed(id)));
      this.error.set(null);
      this.estado.set('listo');
    } catch (e) {
      this.error.set(aError(e));
      this.estado.set('error');
    }
  }

  editar(cambios: EditarContactoRed): Promise<Resultado<ContactoRedDetalle>> {
    return this.ejecutar((id) => this.api.editarContactoRed(id, cambios));
  }

  vincular(postulacionId: string): Promise<Resultado<ContactoRedDetalle>> {
    return this.editar({ vincular: postulacionId });
  }

  desvincular(postulacionId: string): Promise<Resultado<ContactoRedDetalle>> {
    return this.editar({ desvincular: postulacionId });
  }

  /** Registra una solicitud, un mensaje o una nota. `agregada` es false si ya estaba. */
  async interaccion(
    entrada: InteraccionEntrada,
  ): Promise<Resultado<ContactoRedDetalle> & { agregada?: boolean }> {
    let agregada: boolean | undefined;
    const r = await this.ejecutar(async (id) => {
      const x = await firstValueFrom(this.api.registrarInteraccionRed(id, entrada));
      agregada = x.agregada;
      return x;
    });
    return r.ok ? { ...r, agregada: agregada ?? true } : r;
  }

  private async ejecutar(
    accion: (id: string) => Promise<ContactoRedDetalle> | ReturnType<Api['verContactoRed']>,
  ): Promise<Resultado<ContactoRedDetalle>> {
    const d = this.detalle();
    if (!d) return { ok: false, error: new ErrorDeApi('NO_ENCONTRADO', 'Sin contacto', 404) };
    this.ocupado.set(true);
    try {
      const salida = accion(d.id);
      const valor = salida instanceof Promise ? await salida : await firstValueFrom(salida);
      this.detalle.set(valor);
      void this.red.reemplazar(valor);
      return { ok: true, valor };
    } catch (e) {
      return { ok: false, error: aError(e) };
    } finally {
      this.ocupado.set(false);
    }
  }
}
