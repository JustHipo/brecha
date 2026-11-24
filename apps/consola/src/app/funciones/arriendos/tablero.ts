import {
  CdkDrag,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { CdkMenuModule } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmDropdownMenuImports } from '@brecha/ui/dropdown-menu';
import { HlmSkeleton } from '@brecha/ui/skeleton';
import type { EstadoPropiedad, Propiedad } from '../../nucleo/api/arriendos.api';
import { Avisos } from '../../nucleo/avisos';
import { ABIERTOS, ArriendosStore, CERRADOS } from './arriendos.store';
import { CalceArriendo, DialogoMover, precioTexto } from './piezas';

/** Tarjeta de una propiedad: lo que decide si vale la pena (precio, calce, brecha) y si te toca responder. */
@Component({
  selector: 'b-tarjeta-propiedad',
  imports: [RouterLink, TranslocoPipe, CalceArriendo, CdkMenuModule, HlmDropdownMenuImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let p = propiedad();
    <article
      class="flex flex-col gap-2 rounded-[12px] border border-linea bg-fondo px-[13px] py-3 shadow-[0_1px_2px_rgb(38_33_30/0.06)]"
      [attr.data-propiedad]="p.id"
    >
      <div class="flex items-start gap-2">
        <a
          [routerLink]="['/arriendos/propiedades', p.id]"
          class="flex-1 font-semibold text-tinta no-underline hover:underline"
          >{{ p.titulo }}</a
        >
        <button
          type="button"
          class="-mr-1 rounded-md px-1.5 text-tinta-suave hover:bg-superficie"
          [hlmDropdownMenuTrigger]="menu"
          [attr.aria-label]="'arriendos.acciones' | transloco: { titulo: p.titulo }"
        >
          ⋯
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 text-[12.5px] text-tinta-suave">
        <span class="font-semibold text-tinta tabular-nums">{{ precio(p) }}</span>
        @if (p.gastosComunes) {
          <span>+ GC</span>
        }
        @if (p.dormitorios !== null) {
          <span>· {{ p.dormitorios }}D</span>
        }
        @if (p.m2) {
          <span>· {{ p.m2 }} m²</span>
        }
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <b-calce-arriendo [calce]="p.calce" />
        @for (c of p.canales; track c) {
          <span class="rounded-full bg-superficie px-2 py-px text-[11.5px] text-tinta-suave">{{
            nombreCanal()(c)
          }}</span>
        }
      </div>
      @if (p.calce.brechas[0]; as b) {
        <p class="m-0 text-[12.5px]" [class.text-error]="b.dura" [class.text-tinta-suave]="!b.dura">
          {{ b.texto }}
        </p>
      }
      @if (p.pendiente === 'responder') {
        <p class="m-0 text-[12.5px] font-semibold text-acento">
          {{ 'arriendos.teTocaResponder' | transloco }}
        </p>
      }
      @if (p.proximaVisita) {
        <p class="m-0 text-[12.5px] text-tinta-suave">
          {{ 'arriendos.visitaEl' | transloco: { fecha: fecha(p.proximaVisita) } }}
        </p>
      }
      @if (p.discrepanciasAbiertas) {
        <p
          class="-mx-[13px] mb-[-12px] flex gap-[7px] rounded-b-[12px] border-t border-aviso-borde bg-aviso-fondo px-[13px] py-[9px] text-[12.5px] font-semibold text-aviso-tinta"
        >
          <span aria-hidden="true">⚠</span>{{ 'arriendos.discrepancia' | transloco }}
        </p>
      }
    </article>
    <ng-template #menu>
      <div hlmDropdownMenu class="w-52">
        @for (e of p.transicionesPosibles; track e) {
          <button hlmDropdownMenuItem (triggered)="mover.emit({ p, a: e })">
            {{ 'arriendos.moverA' | transloco: { estado: ('estadosArriendo.' + e | transloco) } }}
          </button>
        }
        <a hlmDropdownMenuItem [routerLink]="['/arriendos/propiedades', p.id]">{{
          'arriendos.abrirFicha' | transloco
        }}</a>
      </div>
    </ng-template>
  `,
})
export class TarjetaPropiedad {
  readonly propiedad = input.required<Propiedad>();
  readonly nombreCanal = input.required<(id: string) => string>();
  readonly mover = output<{ p: Propiedad; a: EstadoPropiedad }>();
  protected readonly precio = precioTexto;
  protected fecha(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

/** Tablero de Arriendos: columnas por estado del embudo; arrastrar o «Mover a…» con teclado. */
@Component({
  selector: 'b-arriendos-tablero',
  imports: [
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    RouterLink,
    TranslocoPipe,
    HlmButton,
    HlmSkeleton,
    TarjetaPropiedad,
    DialogoMover,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full flex-col gap-4 px-6 pt-[22px] pb-5' },
  template: `
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-[260px] flex-1">
        <h1 class="titulo-pagina m-0">{{ 'arriendos.titulo' | transloco }}</h1>
        @if (store.resumen(); as r) {
          <p class="mt-0.5 mb-0 text-tinta-suave">
            {{ 'arriendos.resumen' | transloco: { total: r.total, abiertas: r.abiertas } }}
            @if (r.porResponder) {
              ·
              <span class="font-semibold text-acento">{{
                'arriendos.porResponder' | transloco: { n: r.porResponder }
              }}</span>
            }
          </p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label
          class="flex h-[34px] items-center gap-2 rounded-full border border-linea bg-fondo px-3"
        >
          <span class="solo-lector">{{ 'arriendos.filtrar' | transloco }}</span>
          <input
            class="w-44 bg-transparent outline-none"
            [placeholder]="'arriendos.filtrar' | transloco"
            [value]="store.texto()"
            (input)="store.texto.set($any($event.target).value)"
          />
        </label>
        <label class="flex items-center gap-1.5 text-[12.5px] text-tinta-suave">
          <span>{{ 'arriendos.canal' | transloco }}</span>
          <select
            class="h-8 rounded-full border border-linea bg-superficie px-2.5 text-tinta"
            (change)="store.canal.set($any($event.target).value)"
          >
            <option value="">{{ 'arriendos.todos' | transloco }}</option>
            @for (c of store.canales(); track c.id) {
              <option [value]="c.id" [selected]="store.canal() === c.id">{{ c.nombre }}</option>
            }
          </select>
        </label>
        <a hlmBtn variant="outline" routerLink="/arriendos/busqueda">{{
          'arriendos.tuBusqueda' | transloco
        }}</a>
        <a hlmBtn variant="outline" routerLink="/arriendos/importar">{{
          'nav.importarArriendos' | transloco
        }}</a>
        <a hlmBtn routerLink="/arriendos/propiedades/nueva"
          >+ {{ 'arriendos.nueva' | transloco }}</a
        >
      </div>
    </div>

    @switch (store.estado()) {
      @case ('error') {
        <div
          role="alert"
          class="flex items-center gap-3 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
        >
          <span class="flex-1">{{ store.error()?.clave ?? 'errores.RED' | transloco }}</span>
          <button hlmBtn variant="outline" size="sm" type="button" (click)="store.cargar()">
            {{ 'tablero.reintentar' | transloco }}
          </button>
        </div>
      }
      @case ('listo') {
        @if ((store.resumen()?.total ?? 0) === 0) {
          <div class="grid flex-1 place-items-center">
            <div
              class="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed border-linea bg-superficie p-10 text-center"
            >
              <h2 class="m-0 text-xl font-extrabold">{{ 'arriendos.vacioTitulo' | transloco }}</h2>
              <p class="m-0 text-tinta-suave">{{ 'arriendos.vacioTexto' | transloco }}</p>
              <div class="flex gap-2">
                <a hlmBtn variant="outline" routerLink="/arriendos/busqueda">{{
                  'arriendos.tuBusqueda' | transloco
                }}</a>
                <a hlmBtn routerLink="/arriendos/propiedades/nueva">{{
                  'arriendos.nueva' | transloco
                }}</a>
              </div>
            </div>
          </div>
        }
      }
    }

    @if (
      store.estado() === 'cargando' ||
      (store.estado() === 'listo' && (store.resumen()?.total ?? 0) > 0)
    ) {
      <div class="flex-1 overflow-x-auto pb-2">
        <div
          cdkDropListGroup
          class="grid min-w-[1500px] grid-cols-[repeat(6,minmax(220px,1fr))_minmax(200px,1fr)] items-start gap-3.5"
          [attr.aria-busy]="store.estado() === 'cargando'"
        >
          @for (estado of abiertos; track estado) {
            <section
              [attr.aria-label]="'estadosArriendo.' + estado | transloco"
              class="flex min-h-40 flex-col gap-2.5 rounded-[12px] transition-opacity"
              [class.opacity-40]="arrastrando() && !acepta(estado)"
              cdkDropList
              [cdkDropListData]="estado"
              (cdkDropListDropped)="soltar($event)"
              [id]="'col-arriendo-' + estado"
            >
              <h2
                class="m-0 flex items-center gap-2 border-b-2 border-linea px-1 pb-1.5 text-[13.5px] font-bold"
              >
                <span>{{ 'estadosArriendo.' + estado | transloco }}</span>
                <span class="font-medium text-tinta-suave">{{ store.columna(estado).length }}</span>
              </h2>
              @if (store.estado() === 'cargando') {
                <div hlmSkeleton class="h-28 rounded-[12px]"></div>
              } @else {
                @for (p of store.columna(estado); track p.id) {
                  <b-tarjeta-propiedad
                    cdkDrag
                    [cdkDragData]="p"
                    (cdkDragStarted)="arrastrando.set(p)"
                    (cdkDragEnded)="arrastrando.set(null)"
                    [propiedad]="p"
                    [nombreCanal]="store.nombreCanal()"
                    (mover)="moverA($event.p, $event.a)"
                  >
                    <div
                      *cdkDragPlaceholder
                      class="h-24 rounded-[12px] border-[1.5px] border-dashed border-acento bg-acento-suave"
                    ></div>
                  </b-tarjeta-propiedad>
                } @empty {
                  <div
                    class="grid h-[100px] place-items-center rounded-[12px] border-[1.5px] border-dashed border-linea bg-superficie px-3 text-center text-[12.5px] text-tinta-suave"
                  >
                    {{ 'arriendos.vacioColumna' | transloco }}
                  </div>
                }
              }
            </section>
          }
          <section
            class="flex flex-col gap-2.5"
            [attr.aria-label]="'arriendos.cerradas' | transloco"
          >
            <h2 class="m-0 border-b-2 border-linea px-1 pb-1.5 text-[13.5px] font-bold">
              {{ 'arriendos.cerradas' | transloco }}
            </h2>
            @for (c of cerrados; track c) {
              <details class="rounded-[10px] border border-linea bg-superficie px-3 py-2">
                <summary class="cursor-pointer text-[13px] font-semibold">
                  {{ 'estadosArriendo.' + c | transloco }} · {{ store.columna(c).length }}
                </summary>
                <div class="mt-2 flex flex-col gap-2">
                  @for (p of store.columna(c); track p.id) {
                    <b-tarjeta-propiedad
                      [propiedad]="p"
                      [nombreCanal]="store.nombreCanal()"
                      (mover)="moverA($event.p, $event.a)"
                    />
                  }
                </div>
              </details>
            }
          </section>
        </div>
      </div>
    }
    <b-dialogo-mover />
  `,
})
export class ArriendosTableroPagina {
  protected readonly store = inject(ArriendosStore);
  private readonly avisos = inject(Avisos);
  private readonly t = inject(TranslocoService);
  private readonly dialogo = viewChild.required(DialogoMover);
  protected readonly abiertos = ABIERTOS;
  protected readonly cerrados = CERRADOS;
  protected readonly arrastrando = signal<Propiedad | null>(null);

  constructor() {
    if (this.store.estado() !== 'cargando') void this.store.cargar(this.store.estado() === 'listo');
  }

  protected acepta(e: EstadoPropiedad): boolean {
    const p = this.arrastrando();
    return !p || p.estado === e || p.transicionesPosibles.includes(e);
  }

  protected async soltar(
    e: CdkDragDrop<EstadoPropiedad, EstadoPropiedad, Propiedad>,
  ): Promise<void> {
    const p = e.item.data;
    if (p.estado === e.container.data) return;
    await this.moverA(p, e.container.data);
  }

  protected async moverA(p: Propiedad, a: EstadoPropiedad): Promise<void> {
    const cuerpo = await this.dialogo().pedir(a);
    if (!cuerpo) return;
    const r = await this.store.mover(p, cuerpo);
    if (!r.ok) {
      this.avisos.error(r.error);
      return;
    }
    if (r.valor.discrepanciasAbiertas > p.discrepanciasAbiertas)
      this.avisos.aviso('arriendos.noCalza');
    else
      this.avisos.exito('arriendos.movida', { estado: this.t.translate(`estadosArriendo.${a}`) });
  }
}
