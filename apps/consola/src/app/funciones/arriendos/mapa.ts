import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { firstValueFrom } from 'rxjs';
import { ApiArriendos, type EstadoPropiedad } from '../../nucleo/api/arriendos.api';
import { Avisos } from '../../nucleo/avisos';
import { MapaBase, type Pin } from '../mapa/mapa-base';
import { ArriendosStore, CERRADOS } from './arriendos.store';
import { CalceArriendo, precioTexto } from './piezas';

/** Color del pin según el estado: del gris de lo recién visto al verde de lo aprobado. */
const COLOR: Partial<Record<EstadoPropiedad, string>> = {
  vista: '#8A8178',
  contactada: '#3D63DD',
  visita_agendada: '#7A4FD1',
  visitada: '#B5532A',
  en_evaluacion: '#D9A21B',
  aprobada: '#2F9E6B',
};

/**
 * Mapa de Arriendos (P11): cada propiedad en su dirección. Punteado si es aproximado (centro de la comuna);
 * se arrastra para corregirlo y queda fijo. Las direcciones se ubican con OpenStreetMap si está prendido.
 */
@Component({
  selector: 'b-arriendos-mapa',
  imports: [TranslocoPipe, RouterLink, HlmButton, MapaBase, CalceArriendo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full flex-col gap-4 px-6 pt-[22px] pb-6' },
  template: `
    <div>
      <h1 class="titulo-pagina m-0">{{ 'nav.mapa' | transloco }}</h1>
      <p class="mt-0.5 mb-0 text-tinta-suave">{{ 'mapa.ayudaArriendos' | transloco }}</p>
    </div>
    <div class="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <b-mapa
        class="min-h-[520px]"
        [pines]="pines()"
        [etiqueta]="'mapa.etiquetaArriendos' | transloco"
        (elegido)="elegida.set($event)"
        (movido)="mover($event)"
      />
      <aside class="flex flex-col gap-3" [attr.aria-label]="'mapa.lista' | transloco">
        @if (elegidaP(); as p) {
          <section
            class="flex flex-col gap-1.5 rounded-[12px] border border-linea p-3"
            data-propiedad-elegida
          >
            <a [routerLink]="['/arriendos/propiedades', p.id]" class="font-semibold">{{
              p.titulo
            }}</a>
            <span class="text-[13px] text-tinta-suave"
              >{{ 'estadosArriendo.' + p.estado | transloco }} · {{ precio(p) }}</span
            >
            <b-calce-arriendo [calce]="p.calce" />
            @if (p.ubicacion?.origen === 'comuna') {
              <span class="text-[12.5px] text-tinta-suave">{{
                'mapa.aproximada' | transloco
              }}</span>
            }
          </section>
        }
        <ul class="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px] text-tinta-suave">
          @for (e of leyenda; track e[0]) {
            <li class="flex items-center gap-2">
              <span class="size-3 rounded-full" [style.background]="e[1]" aria-hidden="true"></span>
              {{ 'estadosArriendo.' + e[0] | transloco }}
            </li>
          }
        </ul>
        <section class="flex flex-col gap-1.5 rounded-[12px] bg-superficie p-3 text-[13.5px]">
          <h2 class="m-0 text-[13.5px] font-bold">
            {{ 'mapa.sinUbicar' | transloco: { n: sinUbicar().length } }}
          </h2>
          @for (p of sinUbicar(); track p.id) {
            <a [routerLink]="['/arriendos/propiedades', p.id]" class="text-[13px]">{{
              p.titulo
            }}</a>
          }
          @if (sinUbicar().length) {
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              class="self-start"
              (click)="ubicar()"
              [disabled]="ubicando()"
            >
              {{ 'mapa.ubicar' | transloco }}
            </button>
            <p class="m-0 text-[12px] text-tinta-suave">{{ 'mapa.ubicarAyuda' | transloco }}</p>
          }
        </section>
      </aside>
    </div>
  `,
})
export class ArriendosMapaPagina {
  protected readonly store = inject(ArriendosStore);
  private readonly api = inject(ApiArriendos);
  private readonly avisos = inject(Avisos);
  protected readonly elegida = signal<string | null>(null);
  protected readonly ubicando = signal(false);
  protected readonly precio = precioTexto;
  protected readonly leyenda = Object.entries(COLOR);

  private readonly abiertas = computed(() =>
    this.store.filtradas().filter((p) => !CERRADOS.includes(p.estado)),
  );
  protected readonly sinUbicar = computed(() => this.abiertas().filter((p) => !p.ubicacion));
  protected readonly elegidaP = computed(
    () => this.abiertas().find((p) => p.id === this.elegida()) ?? null,
  );
  protected readonly pines = computed<Pin[]>(() =>
    this.abiertas().flatMap((p) =>
      p.ubicacion
        ? [
            {
              id: p.id,
              lat: p.ubicacion.lat,
              lon: p.ubicacion.lon,
              texto: `${p.titulo} · ${precioTexto(p)}`,
              color: COLOR[p.estado] ?? '#8A8178',
              aproximado: p.ubicacion.origen === 'comuna',
              arrastrable: true,
            },
          ]
        : [],
    ),
  );

  constructor() {
    void this.store.cargar(this.store.estado() === 'listo');
  }

  protected async mover(e: { id: string; lat: number; lon: number }): Promise<void> {
    try {
      await firstValueFrom(this.api.fijarUbicacion(e.id, e.lat, e.lon));
      this.avisos.exito('mapa.fijada');
      void this.store.cargar(true);
    } catch (err) {
      this.avisos.error(err);
    }
  }

  protected async ubicar(): Promise<void> {
    this.ubicando.set(true);
    try {
      const r = await firstValueFrom(this.api.ubicarPendientes());
      this.avisos.exito('mapa.ubicando', { n: r.pendientes });
      setTimeout(() => void this.store.cargar(true), Math.min(30, r.pendientes + 2) * 1100);
    } catch (err) {
      this.avisos.error(err);
    } finally {
      this.ubicando.set(false);
    }
  }
}
