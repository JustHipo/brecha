import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { EstadoPostulacion, Resumen } from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../nucleo/api/api.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Formato } from '../../nucleo/idioma/idioma';
import { EtiquetaPlataforma, PuntoPrioridad } from '../../compartido/piezas';
import { ABIERTOS, CERRADOS } from '../tablero/tablero.store';

type Columna =
  'prioridad' | 'empresa' | 'titulo' | 'plataforma' | 'estado' | 'cierre' | 'actualizada';
const PESO = { alta: 0, media: 1, baja: 2 } as const;
const POR_PAGINA = 25;

/** Lista (ui.md §4.3): para buscar y revisar, no para mover. Filtros, orden por columna y paginación. */
@Component({
  selector: 'b-lista',
  imports: [TranslocoPipe, HlmButton, HlmInput, EtiquetaPlataforma, PuntoPrioridad],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-6' },
  template: `
    <h1 class="titulo-pagina m-0">{{ 'lista.titulo' | transloco }}</h1>
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-tinta-suave">{{ 'lista.buscar' | transloco }}</span>
        <input
          hlmInput
          class="w-64"
          [value]="q()"
          (input)="q.set($any($event.target).value); offset.set(0)"
        />
      </label>
      <fieldset class="flex flex-col gap-1">
        <legend class="mb-1 text-xs font-semibold text-tinta-suave">
          {{ 'lista.estados' | transloco }}
        </legend>
        <div class="flex flex-wrap gap-1">
          @for (e of todosLosEstados; track e) {
            <button
              hlmBtn
              size="xs"
              type="button"
              [variant]="estados().includes(e) ? 'default' : 'outline'"
              [attr.aria-pressed]="estados().includes(e)"
              (click)="alternar(estados, e)"
            >
              {{ 'estados.' + e | transloco }}
            </button>
          }
        </div>
      </fieldset>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-tinta-suave">{{
          'tablero.filtroPlataforma' | transloco
        }}</span>
        <select
          class="h-9 rounded-md border border-linea bg-fondo px-2"
          (change)="plataforma.set($any($event.target).value); offset.set(0)"
        >
          <option value="">{{ 'lista.todos' | transloco }}</option>
          @for (p of plataformas; track p) {
            <option [value]="p" [selected]="plataforma() === p">
              {{ 'plataformas.' + p | transloco }}
            </option>
          }
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-tinta-suave">{{
          'tablero.filtroPrioridad' | transloco
        }}</span>
        <select
          class="h-9 rounded-md border border-linea bg-fondo px-2"
          (change)="prioridad.set($any($event.target).value); offset.set(0)"
        >
          <option value="">{{ 'lista.todos' | transloco }}</option>
          @for (p of ['alta', 'media', 'baja']; track p) {
            <option [value]="p" [selected]="prioridad() === p">
              {{ 'prioridad.' + p | transloco }}
            </option>
          }
        </select>
      </label>
    </div>

    @if (error(); as e) {
      <div
        role="alert"
        class="flex items-center gap-3 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
      >
        <span class="flex-1">{{ e.clave | transloco }}</span>
        <button hlmBtn variant="outline" size="sm" type="button" (click)="cargar()">
          {{ 'tablero.reintentar' | transloco }}
        </button>
      </div>
    }

    <div class="overflow-x-auto rounded-[12px] border border-linea">
      <table class="w-full border-collapse text-left">
        <thead class="bg-superficie">
          <tr>
            @for (c of columnas; track c) {
              <th
                scope="col"
                class="px-3 py-2 text-xs font-semibold text-tinta-suave"
                [attr.aria-sort]="
                  orden().col === c ? (orden().asc ? 'ascending' : 'descending') : 'none'
                "
              >
                <button
                  type="button"
                  class="inline-flex items-center gap-1"
                  (click)="ordenar(c)"
                  [attr.aria-label]="
                    'lista.ordenar' | transloco: { columna: ('lista.columnas.' + c | transloco) }
                  "
                >
                  {{ 'lista.columnas.' + c | transloco }}
                  @if (orden().col === c) {
                    <span aria-hidden="true">{{ orden().asc ? '▲' : '▼' }}</span>
                  }
                </button>
              </th>
            }
          </tr>
        </thead>
        <tbody [attr.aria-busy]="cargando()">
          @for (p of ordenadas(); track p.id) {
            <tr
              class="cursor-pointer border-t border-linea hover:bg-superficie-panel"
              (click)="abrir(p)"
            >
              <td class="px-3 py-2"><b-prioridad class="text-xs" [prioridad]="p.prioridad" /></td>
              <td class="px-3 py-2 font-semibold">
                <a
                  class="text-tinta no-underline"
                  [href]="'/postulaciones/' + p.id"
                  (click)="$event.preventDefault()"
                  >{{ p.empresa }}</a
                >
              </td>
              <td class="px-3 py-2">{{ p.titulo }}</td>
              <td class="px-3 py-2"><b-plataforma [plataforma]="p.plataforma" /></td>
              <td class="px-3 py-2">{{ 'estados.' + p.estado | transloco }}</td>
              <td class="px-3 py-2 tabular-nums">{{ formato.fechaCorta(p.cierre) }}</td>
              <td class="px-3 py-2 text-tinta-suave tabular-nums">
                {{ formato.fechaCorta(p.actualizadaEn) }}
              </td>
            </tr>
          } @empty {
            @if (!cargando()) {
              <tr>
                <td colspan="7" class="px-3 py-8 text-center text-tinta-suave">
                  {{ 'lista.vacia' | transloco }}
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    <div class="flex items-center gap-3">
      <span class="text-tinta-suave tabular-nums">{{
        'lista.pagina'
          | transloco
            : {
                desde: total() ? offset() + 1 : 0,
                hasta: offset() + items().length,
                total: total(),
              }
      }}</span>
      <span class="flex-1"></span>
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        [disabled]="offset() === 0"
        (click)="offset.set(offset() - porPagina)"
      >
        {{ 'lista.anterior' | transloco }}
      </button>
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        [disabled]="offset() + porPagina >= total()"
        (click)="offset.set(offset() + porPagina)"
      >
        {{ 'lista.siguiente' | transloco }}
      </button>
    </div>
  `,
})
export class ListaPagina {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly formato = inject(Formato);

  protected readonly todosLosEstados: EstadoPostulacion[] = [...ABIERTOS, ...CERRADOS];
  protected readonly plataformas = [
    'linkedin',
    'trabajando',
    'getonboard',
    'computrabajo',
    'chiletrabajos',
    'indeed',
    'sitio_empresa',
    'otra',
  ];
  protected readonly columnas: Columna[] = [
    'prioridad',
    'empresa',
    'titulo',
    'plataforma',
    'estado',
    'cierre',
    'actualizada',
  ];
  protected readonly porPagina = POR_PAGINA;

  protected readonly q = signal('');
  protected readonly estados = signal<string[]>([]);
  protected readonly plataforma = signal('');
  protected readonly prioridad = signal('');
  protected readonly offset = signal(0);
  protected readonly orden = signal<{ col: Columna; asc: boolean }>({
    col: 'actualizada',
    asc: false,
  });

  protected readonly items = signal<Resumen[]>([]);
  protected readonly total = signal(0);
  protected readonly cargando = signal(false);
  protected readonly error = signal<ErrorDeApi | null>(null);

  /** Ordena la página actual por la columna elegida. */
  protected readonly ordenadas = computed(() => {
    const { col, asc } = this.orden();
    const valor = (p: Resumen): string | number =>
      col === 'prioridad'
        ? PESO[p.prioridad]
        : col === 'cierre'
          ? (p.cierre ?? '9999')
          : col === 'actualizada'
            ? p.actualizadaEn
            : String(p[col]).toLowerCase();
    return [...this.items()].sort((a, b) => {
      const x = valor(a);
      const y = valor(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
    });
  });

  constructor() {
    effect(() => {
      // Cada cambio de filtro o de página vuelve a pedir la lista.
      this.q();
      this.estados();
      this.plataforma();
      this.prioridad();
      this.offset();
      void this.cargar();
    });
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await firstValueFrom(
        this.api.listar({
          q: this.q(),
          estado: this.estados(),
          plataforma: this.plataforma() ? [this.plataforma()] : [],
          prioridad: this.prioridad() ? [this.prioridad()] : [],
          limit: POR_PAGINA,
          offset: this.offset(),
        }),
      );
      this.items.set(r.items);
      this.total.set(r.total);
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0));
    } finally {
      this.cargando.set(false);
    }
  }

  protected alternar(s: ReturnType<typeof signal<string[]>>, v: string): void {
    s.update((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]));
    this.offset.set(0);
  }

  protected ordenar(c: Columna): void {
    this.orden.update((o) => ({ col: c, asc: o.col === c ? !o.asc : true }));
  }

  protected abrir(p: Resumen): void {
    void this.router.navigate(['/postulaciones', p.id]);
  }
}
