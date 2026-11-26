import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { Api, type ContactoRed, type ContactoRedEntrada } from '../../nucleo/api/api.service';
import { Avatar } from '../../compartido/piezas';
import { DialogoBase, ESTILO } from '../postulacion/dialogos/base';
import { TableroStore } from '../tablero/tablero.store';
import { PendienteRed } from './piezas';

/** «Titular · Empresa», sin separadores sueltos. */
export function lineaDeContacto(c: Pick<ContactoRed, 'titular' | 'empresa'>): string {
  return [c.titular, c.empresa].filter((x): x is string => !!x).join(' · ');
}

/** Mismo criterio que el núcleo: `linkedin.com/in/<id>`, con o sin https y www. */
export const PERFIL_LINKEDIN =
  /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/[^/?#\s]+\/?(?:[?#]\S*)?$/i;

interface ContextoNuevo {
  /** Si viene de la ficha, la postulación ya está elegida. */
  postulacionId?: string;
  empresa?: string;
}

/** Agregar a alguien de LinkedIn: nombre y perfil; titular, empresa y postulación opcionales. */
@Component({
  selector: 'b-dialogo-nuevo-contacto',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="enviar()" novalidate>
      <div [class]="e.cabecera">
        <div class="flex-1">
          <h2 [class]="e.titulo">{{ 'red.nuevo.titulo' | transloco }}</h2>
          <p [class]="e.subtitulo">{{ 'red.nuevo.subtitulo' | transloco }}</p>
        </div>
      </div>
      <div [class]="e.cuerpo">
        @for (c of campos; track c.nombre) {
          <div [class]="e.campo">
            <label [for]="'rn-' + c.nombre" [class]="e.etiqueta">{{
              'red.nuevo.' + c.nombre | transloco
            }}</label>
            <input
              hlmInput
              [id]="'rn-' + c.nombre"
              [formControlName]="c.nombre"
              [type]="c.nombre === 'perfilUrl' ? 'url' : 'text'"
              [attr.placeholder]="c.nombre === 'perfilUrl' ? 'linkedin.com/in/…' : null"
              [attr.aria-invalid]="invalido(c.nombre)"
              [attr.aria-describedby]="invalido(c.nombre) ? 'rn-' + c.nombre + '-error' : null"
            />
            @if (invalido(c.nombre)) {
              <span [id]="'rn-' + c.nombre + '-error'" [class]="e.error" role="alert">{{
                (c.nombre === 'perfilUrl' && form.controls.perfilUrl.hasError('pattern')
                  ? 'red.nuevo.perfilInvalido'
                  : 'nueva.obligatorio'
                ) | transloco
              }}</span>
            }
          </div>
        }
        @if (!ctx.postulacionId) {
          <div [class]="e.campo">
            <label for="rn-postulacion" [class]="e.etiqueta">{{
              'red.nuevo.postulacion' | transloco
            }}</label>
            <select
              id="rn-postulacion"
              formControlName="postulacionId"
              class="h-9 rounded-md border border-linea bg-fondo px-2"
            >
              <option value="">{{ 'red.nuevo.ninguna' | transloco }}</option>
              @for (p of postulaciones; track p.id) {
                <option [value]="p.id">{{ p.empresa }} · {{ p.titulo }}</option>
              }
            </select>
          </div>
        }
        <p [class]="e.ayuda" class="m-0">{{ 'red.nuevo.ayuda' | transloco }}</p>
      </div>
      <div [class]="e.pie">
        <span class="flex-1"></span>
        <button hlmBtn variant="outline" type="button" (click)="cerrar()">
          {{ 'dialogos.cancelar' | transloco }}
        </button>
        <button hlmBtn type="submit">{{ 'red.nuevo.confirmar' | transloco }}</button>
      </div>
    </form>
  `,
})
export class DialogoNuevoContacto extends DialogoBase<ContextoNuevo, ContactoRedEntrada> {
  protected readonly e = ESTILO;
  protected readonly campos = [
    { nombre: 'nombre' },
    { nombre: 'perfilUrl' },
    { nombre: 'titular' },
    { nombre: 'empresa' },
  ] as const;
  protected readonly postulaciones = [...inject(TableroStore).todas()].sort((a, b) =>
    a.empresa.localeCompare(b.empresa),
  );
  protected readonly form = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    perfilUrl: new FormControl('', {
      nonNullable: true,
      // Opcional (decisión de Juan del 24-nov): sin perfil, el contacto se reconoce por nombre y empresa.
      validators: [Validators.pattern(PERFIL_LINKEDIN)],
    }),
    titular: new FormControl('', { nonNullable: true }),
    empresa: new FormControl(this.ctx.empresa ?? '', { nonNullable: true }),
    postulacionId: new FormControl('', { nonNullable: true }),
  });

  protected invalido(nombre: 'nombre' | 'perfilUrl' | 'titular' | 'empresa'): boolean {
    const c = this.form.controls[nombre];
    return c.invalid && (c.touched || c.dirty);
  }

  protected enviar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const postulacionId = this.ctx.postulacionId ?? v.postulacionId;
    this.cerrar({
      nombre: v.nombre.trim(),
      ...(v.perfilUrl.trim() ? { perfilUrl: v.perfilUrl.trim() } : {}),
      ...(v.titular.trim() ? { titular: v.titular.trim() } : {}),
      ...(v.empresa.trim() ? { empresa: v.empresa.trim() } : {}),
      ...(postulacionId ? { postulacionId } : {}),
    });
  }
}

/** Lo que devuelve el buscador de la red: alguien que ya está, o pedir agregar a alguien nuevo. */
export type Eleccion = { tipo: 'existente'; contacto: ContactoRed } | { tipo: 'nuevo' };

/** Ligar a alguien de tu red a una postulación: buscador sobre los contactos (ficha). */
@Component({
  selector: 'b-dialogo-elegir-contacto',
  imports: [TranslocoPipe, HlmButton, HlmInput, Avatar, PendienteRed],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="e.cabecera">
      <div class="flex-1">
        <h2 [class]="e.titulo">{{ 'red.elegir.titulo' | transloco }}</h2>
        <p [class]="e.subtitulo">{{ ctx.empresa }} · {{ ctx.titulo }}</p>
      </div>
    </div>
    <div [class]="e.cuerpo">
      <div [class]="e.campo">
        <label for="elegir-q" [class]="e.etiqueta">{{ 'red.elegir.buscar' | transloco }}</label>
        <input
          hlmInput
          id="elegir-q"
          type="search"
          [value]="q()"
          (input)="q.set($any($event.target).value)"
          cdkFocusInitial
        />
      </div>
      <ul
        class="m-0 flex max-h-[300px] list-none flex-col gap-1.5 overflow-y-auto p-0"
        [attr.aria-busy]="buscando()"
        [attr.aria-label]="'red.elegir.resultados' | transloco"
      >
        @for (c of resultados(); track c.id) {
          <li>
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-[10px] border border-linea px-3 py-2 text-left hover:bg-superficie disabled:opacity-60"
              [disabled]="ctx.ligados.includes(c.id)"
              (click)="cerrar({ tipo: 'existente', contacto: c })"
            >
              <b-avatar [empresa]="c.nombre" [tamano]="28" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="font-semibold">{{ c.nombre }}</span>
                <span class="truncate text-tinta-suave">{{ lineaDe(c) }}</span>
              </span>
              @if (ctx.ligados.includes(c.id)) {
                <span class="text-xs text-tinta-suave">{{
                  'red.elegir.yaLigado' | transloco
                }}</span>
              } @else {
                <b-pendiente-red [contacto]="c" />
              }
            </button>
          </li>
        } @empty {
          @if (!buscando()) {
            <li class="py-3 text-center text-tinta-suave">
              {{ 'red.elegir.sinResultados' | transloco }}
            </li>
          }
        }
      </ul>
    </div>
    <div [class]="e.pie">
      <button hlmBtn variant="ghost" type="button" (click)="cerrar({ tipo: 'nuevo' })">
        + {{ 'red.elegir.nuevo' | transloco }}
      </button>
      <span class="flex-1"></span>
      <button hlmBtn variant="outline" type="button" (click)="cerrar()">
        {{ 'dialogos.cancelar' | transloco }}
      </button>
    </div>
  `,
})
export class DialogoElegirContacto extends DialogoBase<
  { empresa: string; titulo: string; ligados: string[] },
  Eleccion
> {
  private readonly api = inject(Api);
  protected readonly e = ESTILO;
  protected readonly q = signal('');
  protected readonly resultados = signal<ContactoRed[]>([]);
  protected readonly buscando = signal(true);
  private turno = 0;

  constructor() {
    super();
    effect(() => {
      const q = this.q().trim();
      const turno = ++this.turno;
      const t = setTimeout(() => void this.buscar(q, turno), 200);
      return () => clearTimeout(t);
    });
  }

  protected lineaDe(c: ContactoRed): string {
    return lineaDeContacto(c);
  }

  private async buscar(texto: string, turno: number): Promise<void> {
    this.buscando.set(true);
    try {
      const r = await firstValueFrom(this.api.red({ texto }));
      if (turno === this.turno) this.resultados.set(r.items.slice(0, 30));
    } catch {
      if (turno === this.turno) this.resultados.set([]);
    } finally {
      if (turno === this.turno) this.buscando.set(false);
    }
  }
}
