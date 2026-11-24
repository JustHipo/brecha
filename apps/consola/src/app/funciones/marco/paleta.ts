import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Formato } from '../../nucleo/idioma/idioma';
import { RecorridoStore } from '../recorrido/recorrido.store';
import { TableroStore } from '../tablero/tablero.store';

interface Opcion {
  id: string;
  texto: string;
  traducir: boolean;
  detalle?: string;
  accion: () => void;
}

/** Paleta de comandos con ⌘K (ui.md §1 y §3): ir a una postulación, crear, cambiar idioma. */
@Component({
  selector: 'b-paleta',
  imports: [TranslocoPipe, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'fixed inset-0 z-50 grid place-items-start justify-center bg-[rgb(38_33_30/0.42)] pt-[12vh]',
    '(click)': 'cerrar.emit()',
  },
  template: `
    <div
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="'busqueda.abrir' | transloco"
      class="w-[560px] max-w-[92vw] overflow-hidden rounded-2xl border border-linea bg-fondo shadow-[0_20px_50px_rgb(38_33_30/0.22)]"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      (click)="$event.stopPropagation()"
      (keydown)="tecla($event)"
    >
      <label class="flex items-center gap-2 border-b border-linea px-4">
        <span class="solo-lector">{{ 'busqueda.placeholder' | transloco }}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="text-tinta-suave"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7"></circle>
          <path d="M20 20l-3.5-3.5"></path>
        </svg>
        <input
          cdkFocusInitial
          class="h-12 flex-1 bg-transparent outline-none"
          [placeholder]="'busqueda.placeholder' | transloco"
          [value]="texto()"
          (input)="texto.set($any($event.target).value); activo.set(0)"
          role="combobox"
          aria-expanded="true"
          aria-controls="paleta-opciones"
          [attr.aria-activedescendant]="'paleta-' + activo()"
        />
      </label>
      <ul id="paleta-opciones" role="listbox" class="max-h-[50vh] overflow-auto p-2">
        @for (o of opciones(); track o.id; let i = $index) {
          <!-- El teclado se maneja en el campo (aria-activedescendant); el clic es un atajo para el mouse. -->
          <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
          <li
            [id]="'paleta-' + i"
            role="option"
            [attr.aria-selected]="i === activo()"
            class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2"
            [class.bg-acento-suave]="i === activo()"
            (mouseenter)="activo.set(i)"
            (click)="elegir(o)"
          >
            <span class="flex-1">{{ o.traducir ? (o.texto | transloco) : o.texto }}</span>
            @if (o.detalle) {
              <span class="text-xs text-tinta-suave">{{ o.detalle }}</span>
            }
          </li>
        } @empty {
          <li class="px-3 py-2 text-tinta-suave">{{ 'busqueda.sinResultados' | transloco }}</li>
        }
      </ul>
    </div>
  `,
})
export class PaletaDeComandos {
  readonly cerrar = output<void>();
  private readonly router = inject(Router);
  private readonly store = inject(TableroStore);
  private readonly formato = inject(Formato);
  private readonly recorrido = inject(RecorridoStore);
  private readonly t = inject(TranslocoService);
  protected readonly texto = signal('');
  protected readonly activo = signal(0);

  private readonly comandos: Opcion[] = [
    {
      id: 'c-tablero',
      texto: 'busqueda.irTablero',
      traducir: true,
      accion: () => this.ir('/tablero'),
    },
    { id: 'c-lista', texto: 'busqueda.irLista', traducir: true, accion: () => this.ir('/lista') },
    {
      id: 'c-crear',
      texto: 'busqueda.crear',
      traducir: true,
      accion: () => this.ir('/postulaciones/nueva'),
    },
    {
      id: 'c-es',
      texto: 'busqueda.idiomaEs',
      traducir: true,
      accion: () => this.formato.cambiarIdioma('es'),
    },
    {
      id: 'c-en',
      texto: 'busqueda.idiomaEn',
      traducir: true,
      accion: () => this.formato.cambiarIdioma('en'),
    },
    {
      id: 'c-recorrido',
      texto: 'busqueda.recorrido',
      traducir: true,
      accion: () => this.recorrido.iniciar(),
    },
  ];

  protected readonly opciones = computed<Opcion[]>(() => {
    const q = this.texto().trim().toLowerCase();
    const postulaciones = this.store
      .todas()
      .filter((t) => q && `${t.empresa} ${t.titulo}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map((t) => ({
        id: t.id,
        texto: `${t.empresa} · ${t.titulo}`,
        traducir: false,
        accion: () => this.ir(`/postulaciones/${t.id}`),
      }));
    // Los comandos también se filtran por su texto, para encontrar «recorrido» escribiéndolo.
    const comandos = this.comandos.filter(
      (c) => !q || this.t.translate(c.texto).toLowerCase().includes(q),
    );
    return [...postulaciones, ...comandos];
  });

  protected tecla(e: KeyboardEvent): void {
    const n = this.opciones().length;
    if (e.key === 'Escape') this.cerrar.emit();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activo.set((this.activo() + 1) % Math.max(n, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activo.set((this.activo() - 1 + n) % Math.max(n, 1));
    } else if (e.key === 'Enter') {
      const o = this.opciones()[this.activo()];
      if (o) this.elegir(o);
    }
  }

  protected elegir(o: Opcion): void {
    o.accion();
    this.cerrar.emit();
  }

  private ir(ruta: string): void {
    void this.router.navigateByUrl(ruta);
  }
}
