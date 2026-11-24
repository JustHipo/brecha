import {
  CdkDrag,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { EstadoPostulacion, Resumen } from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { HlmSheetImports } from '@brecha/ui/sheet';
import { HlmSkeleton } from '@brecha/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../nucleo/api/api.service';
import { Avisos } from '../../nucleo/avisos';
import { Formato } from '../../nucleo/idioma/idioma';
import { Transiciones } from '../postulacion/transiciones';
import { Tarjeta } from './tarjeta';
import { ABIERTOS, CERRADOS, SIN_FILTROS, TableroStore } from './tablero.store';

/** Tablero (ui.md §4.2, F1-13): columnas por estado, arrastrar con validación y «Mover a…» con teclado. */
@Component({
  selector: 'b-tablero',
  imports: [
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    RouterLink,
    TranslocoPipe,
    HlmButton,
    HlmSkeleton,
    HlmSheetImports,
    Tarjeta,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full flex-col gap-4 px-6 pt-[22px] pb-5' },
  template: `
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-[260px] flex-1">
        <h1 class="titulo-pagina m-0">{{ 'tablero.titulo' | transloco }}</h1>
        <p class="mt-0.5 mb-0 text-tinta-suave">
          {{ 'tablero.resumen' | transloco: { total: store.total(), abiertas: store.abiertas() } }}
          @if (store.porRevisar()) {
            ·
            <span class="font-semibold text-aviso-tinta">{{
              'tablero.revision' | transloco: { n: store.porRevisar() }
            }}</span>
          }
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label
          class="flex h-[34px] items-center gap-2 rounded-full border border-linea bg-fondo px-3"
        >
          <span class="solo-lector">{{ 'tablero.filtrar' | transloco }}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M3 5h18M6 12h12M10 19h4"></path>
          </svg>
          <input
            class="w-40 bg-transparent outline-none"
            [placeholder]="'tablero.filtrar' | transloco"
            [value]="store.filtros().q"
            (input)="filtrarTexto($any($event.target).value)"
          />
        </label>
        <div
          role="group"
          [attr.aria-label]="'tablero.filtroPrioridad' | transloco"
          class="inline-flex rounded-full border border-linea bg-superficie p-[3px]"
        >
          @for (p of prioridades; track p) {
            <button
              hlmBtn
              size="xs"
              type="button"
              [variant]="store.filtros().prioridades.includes(p) ? 'outline' : 'ghost'"
              [attr.aria-pressed]="store.filtros().prioridades.includes(p)"
              (click)="alternarPrioridad(p)"
            >
              {{ 'prioridad.' + p | transloco }}
            </button>
          }
        </div>
        @if (store.etiquetasEnUso().length) {
          <label class="flex items-center gap-1.5 text-[12.5px] text-tinta-suave">
            <span>{{ 'etiquetas.filtro' | transloco }}</span>
            <select
              data-filtro-etiqueta
              class="h-8 rounded-full border border-linea bg-superficie px-2.5 text-tinta"
              (change)="filtrarEtiqueta($any($event.target).value)"
            >
              <option value="" [selected]="!store.filtros().etiquetas.length">
                {{ 'etiquetas.todas' | transloco }}
              </option>
              @for (e of store.etiquetasEnUso(); track e) {
                <option [value]="e" [selected]="store.filtros().etiquetas.includes(e)">
                  #{{ e }}
                </option>
              }
            </select>
          </label>
        }
        @if (store.hayFiltros()) {
          <button hlmBtn variant="ghost" size="sm" type="button" (click)="limpiar()">
            {{ 'tablero.limpiarFiltros' | transloco }}
          </button>
        }
        <a hlmBtn routerLink="/postulaciones/nueva" data-tutorial="nueva"
          >+ {{ 'nav.nueva' | transloco }}</a
        >
      </div>
    </div>

    <div
      role="list"
      [attr.aria-label]="'tablero.etapas' | transloco"
      class="flex gap-1 overflow-x-auto"
    >
      @for (e of embudo(); track e.clave; let primero = $first; let ultimo = $last) {
        <div
          role="listitem"
          class="flex h-14 min-w-[110px] flex-[1_1_0] flex-col items-center justify-center gap-px pr-[22px] pl-[26px]"
          [style.clip-path]="primero ? clipPrimero : ultimo ? clipUltimo : clipMedio"
          [class.bg-tinta]="primero"
          [class.text-white]="primero"
          [class.bg-[#F1EEE9]]="!primero"
          [class.text-[#5E5751]]="!primero"
        >
          <span class="font-titulo text-lg leading-none font-extrabold tabular-nums">{{
            e.n
          }}</span>
          <span class="etiqueta text-[11px] font-semibold">{{ e.clave | transloco }}</span>
        </div>
      }
    </div>

    @switch (store.estado()) {
      @case ('error') {
        <div
          role="alert"
          class="flex items-center gap-3 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
        >
          <span class="flex-1"
            ><strong>{{ 'tablero.errorRed' | transloco }}</strong>
            {{ store.error()?.clave ?? 'errores.RED' | transloco }}</span
          >
          <button hlmBtn variant="outline" size="sm" type="button" (click)="store.cargar()">
            {{ 'tablero.reintentar' | transloco }}
          </button>
        </div>
      }
      @case ('listo') {
        @if (store.total() === 0) {
          <div class="grid flex-1 place-items-center">
            <div
              class="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed border-linea bg-superficie p-10 text-center"
              data-tutorial="tablero"
            >
              <h2 class="m-0 text-xl font-extrabold">{{ 'tablero.vacioTitulo' | transloco }}</h2>
              <p class="m-0 text-tinta-suave">{{ 'tablero.vacioTexto' | transloco }}</p>
              <div class="flex gap-2">
                <label hlmBtn variant="outline" class="cursor-pointer" data-tutorial="importar">
                  {{ 'tablero.importar' | transloco }}
                  <input
                    type="file"
                    accept="application/json"
                    class="solo-lector"
                    (change)="importar($event)"
                  />
                </label>
                <a hlmBtn variant="outline" routerLink="/importar">{{
                  'csv.importarCsv' | transloco
                }}</a>
                <a hlmBtn routerLink="/postulaciones/nueva">{{ 'nav.nueva' | transloco }}</a>
              </div>
            </div>
          </div>
        }
      }
    }

    @if (store.estado() === 'cargando' || (store.estado() === 'listo' && store.total() > 0)) {
      <div class="flex-1 overflow-x-auto pb-2">
        <div
          cdkDropListGroup
          class="grid min-w-[1500px] grid-cols-[repeat(6,minmax(220px,1fr))_96px] items-start gap-3.5"
          [attr.aria-busy]="store.estado() === 'cargando'"
        >
          @for (estado of abiertos; track estado; let primera = $first) {
            @let col = store.columna(estado);
            <section
              [attr.data-tutorial]="primera ? 'tablero' : null"
              [attr.aria-label]="'estados.' + estado | transloco"
              class="flex min-h-40 flex-col gap-2.5 rounded-[12px] transition-opacity"
              [class.opacity-40]="arrastrando() && !acepta(estado)"
              [attr.aria-description]="
                arrastrando() && !acepta(estado) ? ('tablero.noAcepta' | transloco) : null
              "
              cdkDropList
              [cdkDropListData]="estado"
              (cdkDropListDropped)="soltar($event)"
              [id]="'col-' + estado"
            >
              <h2
                class="m-0 flex items-center gap-2 border-b-2 px-1 pb-1.5 text-[13.5px] font-bold"
                [class.border-linea]="!esAvance(estado)"
                [class.border-acento]="esAvance(estado)"
              >
                <span>{{ 'estados.' + estado | transloco }}</span>
                <span class="font-medium text-tinta-suave">{{ col?.total ?? 0 }}</span>
              </h2>
              @if (store.estado() === 'cargando') {
                <div hlmSkeleton class="h-28 rounded-[12px]"></div>
                <div hlmSkeleton class="h-24 rounded-[12px]"></div>
              } @else {
                @for (t of col?.items ?? []; track t.id) {
                  <b-tarjeta
                    data-tutorial="ficha"
                    cdkDrag
                    [cdkDragData]="t"
                    (cdkDragStarted)="arrastrando.set(t)"
                    (cdkDragEnded)="arrastrando.set(null)"
                    [tarjeta]="t"
                    [fechaCorta]="fechaCorta"
                    (mover)="moverConTeclado($event)"
                  >
                    <div
                      *cdkDragPlaceholder
                      class="h-24 rounded-[12px] border-[1.5px] border-dashed border-acento bg-acento-suave"
                    ></div>
                  </b-tarjeta>
                } @empty {
                  <div
                    class="grid h-[120px] place-items-center rounded-[12px] border-[1.5px] border-dashed border-linea bg-superficie px-3 text-center text-[12.5px] text-tinta-suave"
                  >
                    {{
                      (estado === 'oferta' ? 'tablero.vacioOferta' : 'tablero.vacioColumna')
                        | transloco
                    }}
                  </div>
                }
              }
            </section>
          }
          <hlm-sheet side="right">
            <button
              hlmSheetTrigger
              type="button"
              class="flex min-h-40 w-full flex-col items-center gap-2 rounded-[12px] border border-linea bg-superficie px-2 py-3 text-tinta-suave hover:bg-[#F1EEE9]"
            >
              <span class="text-[13.5px] font-bold text-tinta">{{
                'tablero.cerradas' | transloco
              }}</span>
              <span class="font-titulo text-lg font-extrabold text-tinta tabular-nums">{{
                cerradas().length
              }}</span>
              @for (c of cerrados; track c) {
                <span class="text-[11.5px]"
                  >{{ 'estados.' + c | transloco }} {{ store.columna(c)?.total ?? 0 }}</span
                >
              }
              <span aria-hidden="true">▸</span>
            </button>
            <hlm-sheet-content *hlmSheetPortal="let ctx" class="w-[420px] overflow-y-auto">
              <hlm-sheet-header>
                <h3 hlmSheetTitle>{{ 'tablero.cerradas' | transloco }}</h3>
              </hlm-sheet-header>
              <div class="flex flex-col gap-4 px-4 pb-6">
                @for (c of cerrados; track c) {
                  <section class="flex flex-col gap-2.5">
                    <h4 class="m-0 text-[13.5px] font-bold">
                      {{ 'estados.' + c | transloco }} · {{ store.columna(c)?.total ?? 0 }}
                    </h4>
                    @for (t of store.columna(c)?.items ?? []; track t.id) {
                      <b-tarjeta
                        [tarjeta]="t"
                        [fechaCorta]="fechaCorta"
                        (mover)="moverConTeclado($event)"
                      />
                    }
                  </section>
                }
              </div>
            </hlm-sheet-content>
          </hlm-sheet>
        </div>
      </div>
    }
  `,
})
export class TableroPagina {
  protected readonly store = inject(TableroStore);
  private readonly transiciones = inject(Transiciones);
  private readonly avisos = inject(Avisos);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly formato = inject(Formato);
  private readonly t = inject(TranslocoService);

  protected readonly abiertos = ABIERTOS;
  protected readonly cerrados = CERRADOS;
  protected readonly prioridades = ['alta', 'media', 'baja'] as const;
  protected readonly arrastrando = signal<Resumen | null>(null);
  protected readonly fechaCorta = (f: string) => this.formato.fechaCorta(f);
  protected readonly clipPrimero =
    'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)';
  protected readonly clipMedio =
    'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';
  protected readonly clipUltimo = 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';

  protected readonly cerradas = computed(() =>
    this.store.todas().filter((t) => CERRADOS.includes(t.estado)),
  );
  protected readonly embudo = computed(() => [
    { clave: 'tablero.todas', n: this.store.total() },
    ...ABIERTOS.map((e) => ({ clave: `estados.${e}`, n: this.store.columna(e)?.total ?? 0 })),
    { clave: 'tablero.cerradas', n: this.cerradas().length },
  ]);

  constructor() {
    if (this.store.estado() !== 'cargando') void this.store.cargar(this.store.estado() === 'listo');
  }

  protected esAvance(e: EstadoPostulacion): boolean {
    return ['postulado', 'en_proceso', 'entrevista', 'oferta'].includes(e);
  }

  /**
   * Columnas que no están en transicionesPosibles se atenúan al arrastrar (ui.md §4.2). Igual aceptan soltar:
   * la API manda (ui.md §1) y, si rechaza el salto, la tarjeta vuelve con el mensaje de TRANSICION_INVALIDA (F1-13).
   */
  protected acepta(estado: EstadoPostulacion): boolean {
    const t = this.arrastrando();
    return !t || t.estado === estado || t.transicionesPosibles.includes(estado);
  }

  protected async soltar(
    e: CdkDragDrop<EstadoPostulacion, EstadoPostulacion, Resumen>,
  ): Promise<void> {
    const t = e.item.data;
    const a = e.container.data;
    if (t.estado === a) return;
    await this.moverA(t, a);
  }

  protected async moverConTeclado(t: Resumen): Promise<void> {
    const a = await this.transiciones.elegirDestino(t);
    if (a) await this.moverA(t, a);
  }

  private async moverA(t: Resumen, a: EstadoPostulacion): Promise<void> {
    const extra = await this.transiciones.datosPara(t, a);
    if (extra === null) return; // canceló: la tarjeta queda donde estaba
    const r = await this.store.mover(t, a, extra);
    if (!r.ok) {
      if (r.error.codigo === 'CONFLICTO') this.avisos.aviso('tablero.conflicto');
      else this.avisos.error(r.error);
      return;
    }
    if (r.discrepanciaNueva) {
      this.avisos.aviso(
        'tablero.noCalza',
        {},
        { clave: 'tablero.ver', hacer: () => void this.router.navigate(['/postulaciones', t.id]) },
      );
    } else {
      this.avisos.exito('tablero.movida', { estado: this.t.translate(`estados.${a}`) });
    }
  }

  protected filtrarTexto(q: string): void {
    this.store.filtros.update((f) => ({ ...f, q }));
  }

  protected filtrarEtiqueta(e: string): void {
    this.store.filtros.update((f) => ({ ...f, etiquetas: e ? [e] : [] }));
  }

  protected alternarPrioridad(p: string): void {
    this.store.filtros.update((f) => ({
      ...f,
      prioridades: f.prioridades.includes(p)
        ? f.prioridades.filter((x) => x !== p)
        : [...f.prioridades, p],
    }));
  }

  protected limpiar(): void {
    this.store.filtros.set(SIN_FILTROS);
  }

  protected async importar(e: Event): Promise<void> {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    try {
      const r = await firstValueFrom(this.api.importar(JSON.parse(await archivo.text()) as object));
      this.avisos.exito('tablero.importada', { creadas: r.creadas, omitidas: r.omitidas });
      await this.store.cargar();
    } catch (err) {
      this.avisos.error(err);
    }
  }
}
