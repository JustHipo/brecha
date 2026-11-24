import { A11yModule, LiveAnnouncer } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import type { Paso } from './pasos';
import { type Caja, type Tamano, calcularPosicion } from './posicion';
import { RecorridoStore } from './recorrido.store';

/**
 * Cuánto se espera a que aparezca el ancla antes de mostrar el paso al centro: más si hubo que navegar
 * (la pantalla carga), poco si ya se estaba ahí (el ancla está o no está).
 */
const ESPERA_NAVEGANDO_MS = 1500;
const ESPERA_MS = 250;
/** Aire entre el ancla y el borde del resaltado. */
const HOLGURA = 6;

interface Mostrado {
  paso: Paso;
  indice: number;
  ancla: Element | null;
  nombre: string | null;
}

const igualCaja = (a: Caja | null, b: Caja | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height);
const igualTamano = (a: Tamano | null, b: Tamano | null) =>
  a === b || (!!a && !!b && a.width === b.width && a.height === b.height);

function buscarAncla(anclas: readonly string[]): { el: Element; nombre: string } | null {
  for (const nombre of anclas) {
    for (const el of Array.from(document.querySelectorAll(`[data-tutorial="${nombre}"]`))) {
      if (el.getClientRects().length > 0) return { el, nombre };
    }
  }
  return null;
}

/**
 * Popup del recorrido guiado: resalta el ancla del paso y explica qué es.
 * Modal accesible: foco atrapado, Escape cierra, cada paso se anuncia a los lectores de pantalla y,
 * con «reducir movimiento», nada se anima.
 */
@Component({
  selector: 'b-recorrido',
  imports: [A11yModule, TranslocoPipe, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (store.abierto()) {
      <div class="fixed inset-0 z-[60]" data-recorrido>
        @if (foco(); as f) {
          <div
            aria-hidden="true"
            class="pointer-events-none fixed rounded-[12px] ring-2 ring-white transition-all duration-200 motion-reduce:transition-none"
            style="box-shadow: 0 0 0 200vmax rgb(38 33 30 / 0.5)"
            [style.top.px]="f.top"
            [style.left.px]="f.left"
            [style.width.px]="f.width"
            [style.height.px]="f.height"
            data-recorrido-foco
          ></div>
        } @else {
          <div aria-hidden="true" class="absolute inset-0 bg-[rgb(38_33_30/0.5)]"></div>
        }
        @if (mostrado(); as m) {
          <div
            #dialogo
            role="dialog"
            aria-modal="true"
            aria-labelledby="recorrido-titulo"
            aria-describedby="recorrido-texto"
            cdkTrapFocus
            [cdkTrapFocusAutoCapture]="true"
            (keydown)="tecla($event)"
            class="fixed flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-2 rounded-2xl border border-linea bg-fondo px-5 py-4 text-tinta shadow-[0_20px_50px_rgb(38_33_30/0.25)] duration-200"
            [class.opacity-0]="!medido()"
            [style.transition-property]="animar() ? 'top, left' : 'none'"
            [style.top.px]="pos().top"
            [style.left.px]="pos().left"
            [attr.data-recorrido-paso]="m.paso.id"
            [attr.data-recorrido-ancla]="m.nombre ?? 'centro'"
            [attr.data-recorrido-lado]="pos().lado"
          >
            @if (flecha(); as fl) {
              <span
                aria-hidden="true"
                class="absolute size-3 rotate-45 border-linea bg-fondo"
                [class]="fl.clase"
                [style.top.px]="fl.top"
                [style.left.px]="fl.left"
              ></span>
            }
            <p class="etiqueta m-0 text-tinta-suave">
              {{ 'recorrido.contador' | transloco: { n: m.indice + 1, total: store.total } }}
            </p>
            <h2 id="recorrido-titulo" class="m-0 text-xl leading-tight font-extrabold">
              {{ 'recorrido.pasos.' + m.paso.id + '.titulo' | transloco }}
            </h2>
            <p id="recorrido-texto" class="m-0 leading-relaxed text-[#4A4440]">
              {{ 'recorrido.pasos.' + m.paso.id + '.texto' | transloco }}
            </p>
            <div aria-hidden="true" class="mt-1 flex gap-1">
              @for (p of store.pasos; track p.id; let i = $index) {
                <span
                  class="h-1.5 rounded-full"
                  [class.w-4]="i === m.indice"
                  [class.bg-acento]="i === m.indice"
                  [class.w-1.5]="i !== m.indice"
                  [class.bg-linea]="i !== m.indice"
                ></span>
              }
            </div>
            <div class="mt-2 flex items-center gap-2">
              <button hlmBtn variant="ghost" size="sm" type="button" (click)="store.cerrar()">
                {{ 'recorrido.saltar' | transloco }}
              </button>
              <span class="flex-1"></span>
              @if (m.indice > 0) {
                <button hlmBtn variant="outline" size="sm" type="button" (click)="store.atras()">
                  {{ 'recorrido.atras' | transloco }}
                </button>
              }
              <button
                #primario
                hlmBtn
                size="sm"
                type="button"
                cdkFocusInitial
                (click)="store.siguiente()"
              >
                {{
                  (m.indice === store.total - 1 ? 'recorrido.terminar' : 'recorrido.siguiente')
                    | transloco
                }}
              </button>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class Recorrido {
  protected readonly store = inject(RecorridoStore);
  private readonly router = inject(Router);
  private readonly t = inject(TranslocoService);
  private readonly anunciador = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);

  private readonly dialogo = viewChild<ElementRef<HTMLElement>>('dialogo');
  private readonly primario = viewChild<ElementRef<HTMLElement>>('primario');

  protected readonly mostrado = signal<Mostrado | null>(null);
  private readonly caja = signal<Caja | null>(null, { equal: igualCaja });
  private readonly tamano = signal<Tamano | null>(null, { equal: igualTamano });
  private readonly vista = signal<Tamano>(
    { width: window.innerWidth, height: window.innerHeight },
    { equal: igualTamano },
  );

  /** Paso pedido cuya ancla todavía se está buscando. */
  private pendiente: { paso: Paso; indice: number; hasta: number } | null = null;
  private cuadroId: number | null = null;

  protected readonly foco = computed<Caja | null>(() => {
    const c = this.caja();
    return c
      ? {
          top: c.top - HOLGURA,
          left: c.left - HOLGURA,
          width: c.width + HOLGURA * 2,
          height: c.height + HOLGURA * 2,
        }
      : null;
  });
  protected readonly medido = computed(() => this.tamano() !== null);
  /** Solo se anima el paso de un ancla a otra, nunca la primera aparición ni con «reducir movimiento». */
  protected readonly animar = computed(() => this.medido() && !this.reducirMovimiento());
  protected readonly pos = computed(() =>
    calcularPosicion(this.foco(), this.tamano() ?? { width: 340, height: 220 }, this.vista()),
  );
  protected readonly flecha = computed(() => {
    const p = this.pos();
    if (p.flecha === null) return null;
    const medio = p.flecha - 6;
    switch (p.lado) {
      case 'derecha':
        return { clase: 'border-l border-b', top: medio, left: -7 };
      case 'izquierda':
        return { clase: 'border-t border-r', top: medio, left: (this.tamano()?.width ?? 340) - 7 };
      case 'abajo':
        return { clase: 'border-t border-l', top: -7, left: medio };
      case 'arriba':
        return { clase: 'border-b border-r', top: (this.tamano()?.height ?? 220) - 7, left: medio };
      default:
        return null;
    }
  });

  constructor() {
    effect(() => {
      const abierto = this.store.abierto();
      const paso = this.store.paso();
      const indice = this.store.indice();
      untracked(() => (abierto ? this.irA(paso, indice) : this.detener()));
    });
    inject(DestroyRef).onDestroy(() => this.detener());
  }

  protected tecla(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.store.cerrar();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.store.siguiente();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.store.atras();
    }
  }

  private irA(paso: Paso, indice: number): void {
    const navegar = !!paso.ruta && !this.router.url.startsWith(paso.ruta);
    const espera = navegar ? ESPERA_NAVEGANDO_MS : ESPERA_MS;
    this.pendiente = { paso, indice, hasta: performance.now() + espera };
    if (navegar) void this.router.navigateByUrl(paso.ruta!);
    this.cuadroId ??= requestAnimationFrame(this.cuadro);
  }

  private detener(): void {
    if (this.cuadroId !== null) cancelAnimationFrame(this.cuadroId);
    this.cuadroId = null;
    this.pendiente = null;
    this.mostrado.set(null);
    this.caja.set(null);
    this.tamano.set(null);
  }

  /**
   * Un cuadro de animación mientras el recorrido está abierto: busca el ancla del paso pedido y sigue
   * su posición (scroll, cambio de tamaño, una pantalla que termina de cargar). Leer unas cajas por
   * cuadro es barato y evita perseguir cada causa de movimiento por separado.
   */
  private readonly cuadro = (): void => {
    this.cuadroId = requestAnimationFrame(this.cuadro);
    const pendiente = this.pendiente;
    if (pendiente) {
      const hallada = buscarAncla(pendiente.paso.anclas);
      if (hallada || performance.now() > pendiente.hasta) {
        this.pendiente = null;
        const habia = this.mostrado() !== null;
        this.mostrado.set({
          paso: pendiente.paso,
          indice: pendiente.indice,
          ancla: hallada?.el ?? null,
          nombre: hallada?.nombre ?? null,
        });
        hallada?.el.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: this.reducirMovimiento() ? 'auto' : 'smooth',
        });
        // El primer paso lo anuncia el lector al entrar el foco al diálogo; los demás, el anunciador.
        if (habia) this.anunciar(pendiente.paso, pendiente.indice);
        this.asegurarFoco();
      }
    }
    const m = this.mostrado();
    if (m && !m.ancla?.isConnected) {
      // El ancla se fue (o nunca estuvo): se vuelve a buscar, por si la pantalla terminó de cargar.
      const otra = buscarAncla(m.paso.anclas);
      if (otra || m.ancla) {
        this.mostrado.set({ ...m, ancla: otra?.el ?? null, nombre: otra?.nombre ?? null });
      }
    }
    const r = this.mostrado()?.ancla?.getBoundingClientRect();
    this.caja.set(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    const d = this.dialogo()?.nativeElement;
    this.tamano.set(d ? { width: d.offsetWidth, height: d.offsetHeight } : null);
    this.vista.set({ width: window.innerWidth, height: window.innerHeight });
  };

  private anunciar(paso: Paso, indice: number): void {
    const texto = [
      this.t.translate('recorrido.contador', { n: indice + 1, total: this.store.total }),
      this.t.translate(`recorrido.pasos.${paso.id}.titulo`),
      this.t.translate(`recorrido.pasos.${paso.id}.texto`),
    ].join('. ');
    void this.anunciador.announce(texto, 'polite');
  }

  /** Si el botón con foco desaparece (Atrás en el primer paso), el foco vuelve a «Siguiente». */
  private asegurarFoco(): void {
    afterNextRender(
      () => {
        const d = this.dialogo()?.nativeElement;
        if (d && !d.contains(document.activeElement)) this.primario()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  private reducirMovimiento(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }
}
