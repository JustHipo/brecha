import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Resumen } from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { Api, type AvisoEntrada } from '../../nucleo/api/api.service';
import { EtiquetaPlataforma } from '../../compartido/piezas';
import { DialogoBase, ESTILO } from '../postulacion/dialogos/base';

export const PLATAFORMAS: AvisoEntrada['plataforma'][] = [
  'linkedin',
  'trabajando',
  'getonboard',
  'computrabajo',
  'chiletrabajos',
  'indeed',
  'sitio_empresa',
  'otra',
];
export const MODALIDADES: NonNullable<AvisoEntrada['modalidad']>[] = [
  'remoto',
  'hibrido',
  'presencial',
  'no_indica',
];

interface ContextoSenal {
  resumen: string;
  empresa?: string;
  cargo?: string;
  /** Clave del título si no es «Asociar a una postulación» (la Red lo usa para ligar). */
  titulo?: string;
  /** La Bandeja elige varias (pasos.md §7.3): devuelve una lista de ids. */
  varias?: boolean;
  /** Las que la IA propuso: salen arriba y marcadas. */
  marcadas?: string[];
}

/** Asociar una señal (o ligar un contacto) a una postulación: buscador sobre tus postulaciones. */
@Component({
  selector: 'b-dialogo-asociar',
  imports: [TranslocoPipe, HlmButton, HlmInput, EtiquetaPlataforma],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="e.cabecera">
      <div class="flex-1">
        <h2 [class]="e.titulo">{{ ctx.titulo ?? 'bandeja.asociar.titulo' | transloco }}</h2>
        <p [class]="e.subtitulo">{{ ctx.resumen }}</p>
      </div>
    </div>
    <div [class]="e.cuerpo">
      <div [class]="e.campo">
        <label for="asociar-q" [class]="e.etiqueta">{{
          'bandeja.asociar.buscar' | transloco
        }}</label>
        <input
          hlmInput
          id="asociar-q"
          type="search"
          [value]="q()"
          (input)="q.set($any($event.target).value)"
          cdkFocusInitial
        />
      </div>
      @if (ctx.varias && sugeridas().length) {
        <p class="m-0 text-[12.5px] font-semibold text-tinta-suave">
          {{ 'bandeja.asociar.sugeridas' | transloco }}
        </p>
      }
      <ul
        class="m-0 flex max-h-[300px] list-none flex-col gap-1.5 overflow-y-auto p-0"
        [attr.aria-busy]="buscando()"
        [attr.aria-label]="'bandeja.asociar.resultados' | transloco"
      >
        @for (p of lista(); track p.id) {
          <li>
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left hover:bg-superficie"
              [class.border-acento]="elegidas().has(p.id)"
              [class.bg-acento-suave]="elegidas().has(p.id)"
              [class.border-linea]="!elegidas().has(p.id)"
              [attr.aria-pressed]="ctx.varias ? elegidas().has(p.id) : null"
              [attr.data-asociar]="p.id"
              (click)="elegir(p.id)"
            >
              @if (ctx.varias) {
                <span
                  aria-hidden="true"
                  class="grid size-4 shrink-0 place-items-center rounded border text-[11px] font-bold"
                  [class.border-acento]="elegidas().has(p.id)"
                  [class.bg-acento]="elegidas().has(p.id)"
                  [class.text-fondo]="elegidas().has(p.id)"
                  [class.border-linea]="!elegidas().has(p.id)"
                  >{{ elegidas().has(p.id) ? '✓' : '' }}</span
                >
              }
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="font-semibold">{{ p.empresa }}</span>
                <span class="truncate text-tinta-suave">{{ p.titulo }}</span>
              </span>
              <b-plataforma [plataforma]="p.plataforma" />
              <span class="text-xs text-tinta-suave">{{ 'estados.' + p.estado | transloco }}</span>
            </button>
          </li>
        } @empty {
          @if (!buscando()) {
            <li class="py-3 text-center text-tinta-suave">
              {{ 'bandeja.asociar.sinResultados' | transloco }}
            </li>
          }
        }
      </ul>
    </div>
    <div [class]="e.pie">
      <span class="flex-1"></span>
      <button hlmBtn variant="outline" type="button" (click)="cerrar()">
        {{ 'dialogos.cancelar' | transloco }}
      </button>
      @if (ctx.varias) {
        <button
          hlmBtn
          type="button"
          [disabled]="!elegidas().size"
          (click)="cerrar([...elegidas()])"
          data-asociar-confirmar
        >
          {{ 'bandeja.asociar.confirmar' | transloco: { n: elegidas().size } }}
        </button>
      }
    </div>
  `,
})
export class DialogoAsociar extends DialogoBase<ContextoSenal, string | string[]> {
  private readonly api = inject(Api);
  protected readonly e = ESTILO;
  protected readonly q = signal(this.ctx.marcadas?.length ? '' : (this.ctx.empresa ?? ''));
  protected readonly resultados = signal<Resumen[]>([]);
  protected readonly sugeridas = signal<Resumen[]>([]);
  protected readonly elegidas = signal(new Set<string>(this.ctx.marcadas ?? []));
  protected readonly buscando = signal(true);
  /** Las sugeridas primero, sin repetir las que también salen en la búsqueda. */
  protected readonly lista = computed(() => {
    const ids = new Set(this.sugeridas().map((x) => x.id));
    return [...this.sugeridas(), ...this.resultados().filter((x) => !ids.has(x.id))];
  });
  private turno = 0;

  protected elegir(id: string): void {
    if (!this.ctx.varias) {
      this.cerrar(id);
      return;
    }
    this.elegidas.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  constructor() {
    super();
    const marcadas = this.ctx.marcadas ?? [];
    if (marcadas.length) {
      void Promise.all(
        marcadas.map((id) => firstValueFrom(this.api.ver(id)).catch(() => null)),
      ).then((xs) => this.sugeridas.set(xs.filter((x): x is NonNullable<typeof x> => x !== null)));
    }
    effect(() => {
      const q = this.q().trim();
      const turno = ++this.turno;
      const t = setTimeout(() => void this.buscar(q, turno), 200);
      return () => clearTimeout(t);
    });
  }

  private async buscar(q: string, turno: number): Promise<void> {
    this.buscando.set(true);
    try {
      const r = await firstValueFrom(this.api.listar({ q, limit: 12 }));
      if (turno === this.turno) this.resultados.set(r.items);
    } catch {
      if (turno === this.turno) this.resultados.set([]);
    } finally {
      if (turno === this.turno) this.buscando.set(false);
    }
  }
}

/** Crear una postulación con los datos que trae la señal (el aviso necesita su URL). */
@Component({
  selector: 'b-dialogo-crear-desde-senal',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="enviar()" novalidate>
      <div [class]="e.cabecera">
        <div class="flex-1">
          <h2 [class]="e.titulo">{{ 'bandeja.crear.titulo' | transloco }}</h2>
          <p [class]="e.subtitulo">{{ ctx.resumen }}</p>
        </div>
      </div>
      <div [class]="e.cuerpo">
        @for (c of textos; track c.nombre) {
          <div [class]="e.campo">
            <label [for]="'cs-' + c.nombre" [class]="e.etiqueta">{{
              c.etiqueta | transloco
            }}</label>
            <input
              hlmInput
              [id]="'cs-' + c.nombre"
              [formControlName]="c.nombre"
              [type]="c.tipo"
              [attr.aria-invalid]="invalido(c.nombre)"
              [attr.aria-describedby]="invalido(c.nombre) ? 'cs-' + c.nombre + '-error' : null"
            />
            @if (invalido(c.nombre)) {
              <span [id]="'cs-' + c.nombre + '-error'" [class]="e.error" role="alert">{{
                (c.nombre === 'url' && form.controls.url.hasError('pattern')
                  ? 'nueva.urlInvalida'
                  : 'nueva.obligatorio'
                ) | transloco
              }}</span>
            }
          </div>
        }
        <div class="grid grid-cols-2 gap-3">
          <div [class]="e.campo">
            <label for="cs-plataforma" [class]="e.etiqueta">{{
              'nueva.plataforma' | transloco
            }}</label>
            <select
              id="cs-plataforma"
              formControlName="plataforma"
              class="h-9 rounded-md border border-linea bg-fondo px-2"
            >
              @for (p of plataformas; track p) {
                <option [value]="p">{{ 'plataformas.' + p | transloco }}</option>
              }
            </select>
          </div>
          <div [class]="e.campo">
            <label for="cs-modalidad" [class]="e.etiqueta">{{
              'nueva.modalidad' | transloco
            }}</label>
            <select
              id="cs-modalidad"
              formControlName="modalidad"
              class="h-9 rounded-md border border-linea bg-fondo px-2"
            >
              @for (m of modalidades; track m) {
                <option [value]="m">{{ 'modalidades.' + m | transloco }}</option>
              }
            </select>
          </div>
        </div>
        <p [class]="e.ayuda" class="m-0">{{ 'bandeja.crear.ayuda' | transloco }}</p>
      </div>
      <div [class]="e.pie">
        <span class="flex-1"></span>
        <button hlmBtn variant="outline" type="button" (click)="cerrar()">
          {{ 'dialogos.cancelar' | transloco }}
        </button>
        <button hlmBtn type="submit">{{ 'bandeja.crear.confirmar' | transloco }}</button>
      </div>
    </form>
  `,
})
export class DialogoCrearDesdeSenal extends DialogoBase<
  ContextoSenal & { plataforma: AvisoEntrada['plataforma'] },
  AvisoEntrada
> {
  protected readonly e = ESTILO;
  protected readonly plataformas = PLATAFORMAS;
  protected readonly modalidades = MODALIDADES;
  protected readonly textos = [
    { nombre: 'titulo', etiqueta: 'nueva.tituloCargo', tipo: 'text' },
    { nombre: 'empresa', etiqueta: 'nueva.empresa', tipo: 'text' },
    { nombre: 'url', etiqueta: 'nueva.url', tipo: 'url' },
  ] as const;
  protected readonly form = new FormGroup({
    titulo: new FormControl(this.ctx.cargo ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    empresa: new FormControl(this.ctx.empresa ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^https?:\/\/\S+$/)],
    }),
    plataforma: new FormControl<AvisoEntrada['plataforma']>(this.ctx.plataforma, {
      nonNullable: true,
    }),
    modalidad: new FormControl<NonNullable<AvisoEntrada['modalidad']>>('no_indica', {
      nonNullable: true,
    }),
  });

  protected invalido(nombre: 'titulo' | 'empresa' | 'url'): boolean {
    const c = this.form.controls[nombre];
    return c.invalid && (c.touched || c.dirty);
  }

  protected enviar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.cerrar({
      titulo: v.titulo.trim(),
      empresa: v.empresa.trim(),
      url: v.url.trim(),
      plataforma: v.plataforma,
      modalidad: v.modalidad,
    });
  }
}

/** Confirmación simple para acciones que no se deshacen (descartar una señal). */
@Component({
  selector: 'b-dialogo-confirmar',
  imports: [TranslocoPipe, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="e.cabecera">
      <div class="flex-1">
        <h2 [class]="e.titulo">{{ ctx.titulo | transloco }}</h2>
        <p [class]="e.subtitulo">{{ ctx.detalle }}</p>
      </div>
    </div>
    <div [class]="e.cuerpo">
      <p class="m-0 text-tinta-suave">{{ ctx.texto | transloco }}</p>
    </div>
    <div [class]="e.pie">
      <span class="flex-1"></span>
      <button hlmBtn variant="outline" type="button" (click)="cerrar(false)" cdkFocusInitial>
        {{ 'dialogos.cancelar' | transloco }}
      </button>
      <button hlmBtn variant="destructive" type="button" (click)="cerrar(true)">
        {{ ctx.confirmar | transloco }}
      </button>
    </div>
  `,
})
export class DialogoConfirmar extends DialogoBase<
  { titulo: string; detalle: string; texto: string; confirmar: string },
  boolean
> {
  protected readonly e = ESTILO;
}
