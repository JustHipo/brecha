import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Map as MapaLibre, Marker } from 'maplibre-gl';

/** Un punto en el mapa. Con `conteo` es un pin acumulado (varias postulaciones de una comuna). */
export interface Pin {
  id: string;
  lat: number;
  lon: number;
  /** Lo que lee un lector de pantalla y el título al pasar el mouse. */
  texto: string;
  color: string;
  conteo?: number;
  aproximado?: boolean;
  arrastrable?: boolean;
}

/** Mapa base de OpenFreeMap (sin cuenta ni llave; revisado el 24-nov-2026). MapLibre agrega la atribución. */
export const ESTILO = 'https://tiles.openfreemap.org/styles/liberty';

/** En las pruebas automáticas (sin internet garantizado) el fondo es un color liso: los pines igual se ven. */
const ESTILO_VACIO = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'fondo', type: 'background' as const, paint: { 'background-color': '#efe9e1' } }],
};

const SANTIAGO: [number, number] = [-70.65, -33.45];

/** Copiado de node_modules/maplibre-gl/dist por angular.json. */
export const URL_DEL_WORKER = '/maplibre/maplibre-gl-worker.mjs';

/**
 * Mapa con MapLibre GL JS (P11). Los pines son botones del DOM: se enfocan con teclado y se anuncian.
 * Si no hay internet, se ve un aviso y los pines siguen; si el equipo no puede dibujar el mapa, solo el aviso.
 */
@Component({
  selector: 'b-mapa',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block min-h-[420px] overflow-hidden rounded-[12px] border border-linea',
  },
  template: `
    <div #lienzo class="absolute inset-0" [attr.aria-label]="etiqueta()" role="region"></div>
    @if (problema(); as p) {
      <p
        role="status"
        class="absolute top-2 left-2 z-10 m-0 rounded-[8px] border border-aviso-borde bg-aviso-fondo px-2.5 py-1.5 text-[12.5px] text-aviso-tinta"
      >
        {{ 'mapa.' + p | transloco }}
      </p>
    }
  `,
})
export class MapaBase {
  readonly pines = input.required<Pin[]>();
  readonly etiqueta = input('');
  readonly elegido = output<string>();
  readonly movido = output<{ id: string; lat: number; lon: number }>();

  private readonly lienzo = viewChild.required<ElementRef<HTMLDivElement>>('lienzo');
  protected readonly problema = signal<'sinFondo' | 'sinWebgl' | null>(null);
  private mapa?: MapaLibre;
  private marcadores: Marker[] = [];
  private libre?: typeof import('maplibre-gl');
  private encuadrado = false;
  /** Lo último dibujado: si los pines no cambiaron, no se tocan (un clic no pierde su botón). */
  private dibujado = '';

  constructor() {
    afterNextRender(() => void this.iniciar());
    effect(() => {
      const pines = this.pines();
      if (this.mapa) this.dibujar(pines);
    });
    inject(DestroyRef).onDestroy(() => this.mapa?.remove());
  }

  private async iniciar(): Promise<void> {
    try {
      this.libre = await import('maplibre-gl');
      // El worker que dibuja las teselas es un archivo aparte que el build no empaqueta: se copia como recurso
      // (angular.json) y se le dice a MapLibre dónde está. Sin esto, el fondo real no carga («Worker failed to load»).
      this.libre.setWorkerUrl(URL_DEL_WORKER);
      const automatico = typeof navigator !== 'undefined' && navigator.webdriver;
      this.mapa = new this.libre.Map({
        container: this.lienzo().nativeElement,
        style: automatico ? ESTILO_VACIO : ESTILO,
        center: SANTIAGO,
        zoom: 10,
        attributionControl: { compact: true },
      });
      this.mapa.addControl(new this.libre.NavigationControl({ showCompass: false }), 'top-right');
      // Solo un fondo que no cargó es «sin conexión»; en las pruebas el fondo es local y no hay nada que cargar.
      this.mapa.on('error', (ev: { error?: { message?: string } }) => {
        if (!automatico && /fetch|network|load|failed/i.test(ev.error?.message ?? ''))
          this.problema.set('sinFondo');
      });
      this.dibujar(this.pines());
    } catch {
      this.problema.set('sinWebgl');
    }
  }

  private dibujar(pines: Pin[]): void {
    const ml = this.libre;
    const mapa = this.mapa;
    if (!ml || !mapa) return;
    const clave = JSON.stringify(pines);
    if (clave === this.dibujado) return;
    this.dibujado = clave;
    for (const m of this.marcadores) m.remove();
    this.marcadores = pines.map((p) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.title = p.texto;
      el.setAttribute('aria-label', p.texto);
      el.dataset['pin'] = p.id;
      const grande = p.conteo !== undefined;
      el.className = grande
        ? 'grid min-w-8 h-8 px-1.5 place-items-center rounded-full text-white text-[12.5px] font-bold shadow-md ring-4 ring-white/70'
        : 'block size-4 rounded-full border-2 border-white shadow-md';
      el.style.background = p.aproximado ? 'transparent' : p.color;
      if (p.aproximado) el.style.border = `2px dashed ${p.color}`;
      if (grande) el.textContent = String(p.conteo);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.elegido.emit(p.id);
      });
      const m = new ml.Marker({ element: el, draggable: !!p.arrastrable })
        .setLngLat([p.lon, p.lat])
        .addTo(mapa);
      if (p.arrastrable)
        m.on('dragend', () => {
          const { lat, lng } = m.getLngLat();
          this.movido.emit({ id: p.id, lat, lon: lng });
        });
      return m;
    });
    // Encuadra una vez, al primer dibujo con pines; después respeta lo que la persona movió.
    if (!this.encuadrado && pines.length) {
      this.encuadrado = true;
      const b = new ml.LngLatBounds();
      for (const p of pines) b.extend([p.lon, p.lat]);
      mapa.fitBounds(b, { padding: 60, maxZoom: 14, duration: 0 });
    }
  }
}
