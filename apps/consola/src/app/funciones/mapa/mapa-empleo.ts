import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, map, of } from 'rxjs';
import { TableroStore } from '../tablero/tablero.store';
import { MapaBase, type Pin } from './mapa-base';
import { agrupar, Ubicador, type Comuna } from './ubicaciones';

/**
 * Mapa de tus postulaciones (P11): un pin por comuna con cuántas hay; al tocarlo, la lista de esa comuna.
 * «Remoto» y lo que no se reconoce van al lado. Las comunas salen de una tabla local (OpenStreetMap).
 */
@Component({
  selector: 'b-mapa-empleo',
  imports: [TranslocoPipe, RouterLink, MapaBase],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full flex-col gap-4 px-6 pt-[22px] pb-6' },
  template: `
    <div>
      <h1 class="titulo-pagina m-0">{{ 'nav.mapa' | transloco }}</h1>
      <p class="mt-0.5 mb-0 text-tinta-suave">{{ 'mapa.ayudaEmpleo' | transloco }}</p>
    </div>
    <div class="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <b-mapa
        class="min-h-[520px]"
        [pines]="pines()"
        [etiqueta]="'mapa.etiquetaEmpleo' | transloco"
        (elegido)="elegida.set($event)"
      />
      <aside class="flex flex-col gap-3" [attr.aria-label]="'mapa.lista' | transloco">
        @if (grupoElegido(); as g) {
          <section
            class="flex flex-col gap-1.5 rounded-[12px] border border-linea p-3"
            data-grupo-elegido
          >
            <h2 class="m-0 text-base font-bold">{{ g.comuna.n }} · {{ g.items.length }}</h2>
            @for (p of g.items; track p.id) {
              <a [routerLink]="['/postulaciones', p.id]" class="text-[13.5px]">
                {{ p.empresa }} · {{ p.titulo }}
              </a>
            }
          </section>
        }
        <section class="flex flex-col gap-1 rounded-[12px] bg-superficie p-3 text-[13.5px]">
          <h2 class="m-0 text-[13.5px] font-bold">{{ 'mapa.porComuna' | transloco }}</h2>
          @for (g of datos().grupos; track g.comuna.n) {
            <button
              type="button"
              class="flex justify-between rounded-md px-1 text-left hover:bg-fondo"
              (click)="elegida.set(g.comuna.n)"
            >
              <span>{{ g.comuna.n }}</span><span class="tabular-nums">{{ g.items.length }}</span>
            </button>
          } @empty {
            <p class="m-0 text-tinta-suave">{{ 'mapa.nadaUbicado' | transloco }}</p>
          }
          <p class="mt-2 mb-0">
            {{ 'mapa.remotas' | transloco: { n: datos().remotos.length } }} ·
            {{ 'mapa.sinUbicar' | transloco: { n: datos().sinUbicar.length } }}
          </p>
          @for (p of datos().sinUbicar; track p.id) {
            <a [routerLink]="['/postulaciones', p.id]" class="text-[12.5px] text-tinta-suave">
              {{ p.empresa }} · «{{ p.ubicacion || '—' }}»
            </a>
          }
        </section>
      </aside>
    </div>
  `,
})
export class MapaEmpleoPagina {
  private readonly store = inject(TableroStore);
  private readonly comunas = toSignal(
    inject(HttpClient)
      .get<{ comunas: Comuna[] }>('/geo/comunas-cl.json')
      .pipe(
        map((r) => r.comunas),
        catchError(() => of([] as Comuna[])),
      ),
    { initialValue: [] as Comuna[] },
  );
  protected readonly elegida = signal<string | null>(null);

  protected readonly datos = computed(() => {
    const u = new Ubicador(this.comunas());
    // Las cerradas no cuentan: el mapa es de lo que sigue en curso.
    const abiertas = this.store
      .todas()
      .filter((p) => !['rechazado', 'descartado', 'aceptada'].includes(p.estado));
    return agrupar(abiertas, (p) => u.lugar(p.ubicacion, p.modalidad));
  });

  protected readonly pines = computed<Pin[]>(() =>
    this.datos().grupos.map((g) => ({
      id: g.comuna.n,
      lat: g.comuna.lat,
      lon: g.comuna.lon,
      texto: `${g.comuna.n}: ${g.items.length}`,
      color: '#B5532A',
      conteo: g.items.length,
    })),
  );

  protected readonly grupoElegido = computed(
    () => this.datos().grupos.find((g) => g.comuna.n === this.elegida()) ?? null,
  );

  constructor() {
    if (this.store.estado() === 'inicial') void this.store.cargar();
  }
}
