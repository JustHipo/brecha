import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { Eventos } from '../../nucleo/eventos/eventos.service';
import { Formato, type Idioma } from '../../nucleo/idioma/idioma';
import { BandejaStore } from '../bandeja/bandeja.store';
import { EstadoIaStore } from '../conexiones/estado-ia.store';
import { RedStore } from '../red/red.store';
import { TableroStore } from '../tablero/tablero.store';
import { PaletaDeComandos } from './paleta';

const ICONOS = {
  tablero: 'M4 4h6v16H4zM14 4h6v10h-6z',
  lista: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  bandeja: 'M4 13h4l2 3h4l2-3h4M4 13l2-8h12l2 8v6H4z',
  avisos: 'M4 7h16v12H4zM9 7V5h6v2M4 12h16',
  preguntar: 'M5 5h14v10H9l-4 4zM9 9h6M9 12h4',
  conexiones: 'M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5',
  red: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6',
  ajustes:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};
const PUNTOS = [
  '#BFD5FF',
  '#E3D2FF',
  '#FFE0A8',
  '#B4EBC9',
  '#F3E9E2',
  '#FFD3C2',
  '#D6F0FF',
  '#EDEDED',
];

/** Marco de la ventana (ui.md §3): barra lateral terracota, barra superior y contenido. */
@Component({
  selector: 'b-marco',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, HlmButton, PaletaDeComandos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-dvh min-h-0', '(window:keydown)': 'atajo($event)' },
  template: `
    <nav
      [attr.aria-label]="'nav.secciones' | transloco"
      class="barra-terracota flex w-[236px] flex-none flex-col px-2.5 py-3.5"
    >
      <div class="flex items-center gap-2.5 px-2 pt-1 pb-4">
        <span
          class="grid size-7 place-items-center rounded-lg bg-white font-titulo text-sm font-extrabold text-[#B5532A]"
          aria-hidden="true"
          >B</span
        >
        <span class="font-titulo text-base font-extrabold">{{ 'app.nombre' | transloco }}</span>
      </div>
      @for (n of nav; track n.ruta) {
        <a
          [routerLink]="n.ruta"
          routerLinkActive="bg-white/[0.17] font-semibold"
          class="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] font-medium text-white no-underline hover:bg-white/10"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path [attr.d]="n.icono"></path>
          </svg>
          <span class="flex-1">{{ n.etiqueta | transloco }}</span>
          @if (n.ruta === '/bandeja' && bandeja.conteo()) {
            <span
              class="min-w-5 rounded-full bg-white px-1.5 text-center text-xs font-bold text-[#873719] tabular-nums"
              aria-hidden="true"
              >{{ bandeja.conteo() }}</span
            >
            <span class="solo-lector">{{
              'nav.bandejaPendientes' | transloco: { n: bandeja.conteo() }
            }}</span>
          }
          @if (n.ruta === '/red' && red.porResponder()) {
            <span
              class="min-w-5 rounded-full bg-white px-1.5 text-center text-xs font-bold text-[#873719] tabular-nums"
              aria-hidden="true"
              >{{ red.porResponder() }}</span
            >
            <span class="solo-lector">{{
              'nav.redPendientes' | transloco: { n: red.porResponder() }
            }}</span>
          }
        </a>
      }
      @if (store.porPlataforma().length) {
        <p class="mx-2.5 mt-[18px] mb-1.5 text-xs font-semibold text-barra-tinta-suave">
          {{ 'nav.plataformas' | transloco }}
        </p>
        @for (p of store.porPlataforma(); track p[0]; let i = $index) {
          <button
            type="button"
            (click)="filtrarPlataforma(p[0])"
            class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-white hover:bg-white/10"
            [class.bg-white/[0.17]]="store.filtros().plataformas.includes(p[0])"
            [attr.aria-pressed]="store.filtros().plataformas.includes(p[0])"
          >
            <span
              class="size-[9px] rounded-[3px]"
              [style.background]="puntos[i % puntos.length]"
              aria-hidden="true"
            ></span>
            <span class="flex-1">{{ 'plataformas.' + p[0] | transloco }}</span>
            <span class="text-xs text-barra-tinta-suave tabular-nums">{{ p[1] }}</span>
          </button>
        }
      }
      <div class="flex-1"></div>
      <a
        routerLink="/ajustes"
        routerLinkActive="bg-white/[0.17] font-semibold"
        class="mb-2 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] font-medium text-white no-underline hover:bg-white/10"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path [attr.d]="iconoAjustes"></path>
        </svg>
        <span class="flex-1">{{ 'nav.ajustes' | transloco }}</span>
      </a>
      <div
        class="mx-1 flex flex-col gap-0.5 rounded-[10px] border border-white/15 bg-white/10 px-3 py-2.5"
        role="status"
      >
        <span class="flex items-center gap-[7px] font-semibold">
          <span
            class="size-2 rounded-full"
            [class.bg-[#7EE2A8]]="eventos.conectado()"
            [class.bg-[#F7D6C6]]="!eventos.conectado()"
            aria-hidden="true"
          ></span>
          {{ (eventos.conectado() ? 'nav.sistema' : 'nav.sistemaDesconectado') | transloco }}
        </span>
        <span class="text-xs text-barra-tinta-suave">{{
          (eventos.conectado() ? 'nav.sistemaDetalle' : 'nav.sistemaDetalleDesconectado')
            | transloco
        }}</span>
      </div>
    </nav>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 flex-none items-center gap-3.5 border-b border-linea px-6">
        <span class="text-tinta-suave">{{ 'nav.postulaciones' | transloco }}</span>
        <span class="ml-auto"></span>
        <span role="status" class="contents">
          <a
            [routerLink]="estadoIa.indicador() === 'sin_configurar' ? '/ajustes' : '/conexiones'"
            class="flex items-center gap-[7px] rounded-full border border-linea px-3 py-1 font-semibold text-tinta no-underline hover:bg-superficie"
            [attr.title]="'ia.verConexiones' | transloco"
            data-indicador-ia
          >
            <span
              class="size-2 rounded-full"
              [class.bg-ok]="estadoIa.indicador() === 'lista'"
              [class.bg-prioridad-media]="
                estadoIa.indicador() === 'no_disponible' ||
                estadoIa.indicador() === 'sin_configurar'
              "
              [class.bg-error]="
                estadoIa.indicador() === 'apagada' || estadoIa.indicador() === 'error'
              "
              [class.bg-prioridad-baja]="estadoIa.indicador() === 'cargando'"
              aria-hidden="true"
            ></span>
            {{ 'ia.' + estadoIa.indicador() | transloco: { n: estadoIa.enCola() } }}
          </a>
        </span>
        <button
          type="button"
          (click)="paletaAbierta.set(true)"
          class="flex h-[34px] w-[300px] items-center gap-2 rounded-[9px] border border-linea bg-superficie px-3 text-left text-tinta-suave"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.5-3.5"></path>
          </svg>
          <span class="flex-1">{{ 'busqueda.abrir' | transloco }}</span>
          <kbd class="rounded-[5px] border border-linea px-[5px] text-[11px]">⌘K</kbd>
        </button>
        <div
          role="group"
          [attr.aria-label]="'idioma.etiqueta' | transloco"
          class="inline-flex rounded-full border border-linea bg-superficie p-[3px]"
        >
          @for (i of idiomas; track i) {
            <button
              type="button"
              hlmBtn
              size="xs"
              [variant]="idioma() === i ? 'outline' : 'ghost'"
              [attr.aria-pressed]="idioma() === i"
              (click)="cambiarIdioma(i)"
            >
              {{ 'idioma.' + i | transloco }}
            </button>
          }
        </div>
      </header>
      <div class="min-h-0 flex-1 overflow-auto">
        <router-outlet />
      </div>
    </div>

    @if (paletaAbierta()) {
      <b-paleta (cerrar)="paletaAbierta.set(false)" />
    }
  `,
})
export class Marco {
  protected readonly store = inject(TableroStore);
  protected readonly eventos = inject(Eventos);
  protected readonly bandeja = inject(BandejaStore);
  protected readonly estadoIa = inject(EstadoIaStore);
  protected readonly red = inject(RedStore);
  private readonly formato = inject(Formato);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  protected readonly nav = [
    { ruta: '/tablero', etiqueta: 'nav.tablero', icono: ICONOS.tablero },
    { ruta: '/lista', etiqueta: 'nav.lista', icono: ICONOS.lista },
    { ruta: '/bandeja', etiqueta: 'nav.bandeja', icono: ICONOS.bandeja },
    { ruta: '/red', etiqueta: 'nav.red', icono: ICONOS.red },
    { ruta: '/avisos', etiqueta: 'nav.avisos', icono: ICONOS.avisos },
    { ruta: '/preguntar', etiqueta: 'nav.preguntar', icono: ICONOS.preguntar },
    { ruta: '/conexiones', etiqueta: 'nav.conexiones', icono: ICONOS.conexiones },
  ];
  protected readonly iconoAjustes = ICONOS.ajustes;
  protected readonly puntos = PUNTOS;
  protected readonly idiomas: Idioma[] = ['es', 'en'];
  protected readonly paletaAbierta = signal(false);
  private readonly idiomaActivo = signal(this.transloco.getActiveLang());
  protected readonly idioma = computed(() => this.idiomaActivo());

  constructor() {
    if (this.store.estado() === 'inicial') void this.store.cargar();
    if (this.bandeja.estado() === 'inicial') void this.bandeja.cargar();
    if (this.red.estado() === 'inicial') void this.red.cargar(true);
    this.estadoIa.iniciar();
    this.transloco.langChanges$.subscribe((l) => this.idiomaActivo.set(l));
  }

  protected cambiarIdioma(i: Idioma): void {
    this.formato.cambiarIdioma(i);
  }

  protected filtrarPlataforma(p: string): void {
    this.store.filtros.update((f) => ({
      ...f,
      plataformas: f.plataformas.includes(p)
        ? f.plataformas.filter((x) => x !== p)
        : [...f.plataformas, p],
    }));
    if (!this.router.url.startsWith('/tablero')) void this.router.navigate(['/tablero']);
  }

  protected atajo(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.paletaAbierta.update((v) => !v);
    }
  }
}
