import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
} from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { Avatar } from '../../../compartido/piezas';
import { DialogoBase, ESTILO, hoyIso, type ContextoPostulacion } from './base';

export interface DatosPostular {
  fechaPostulacion: string;
  canal: { tipo: 'portal' | 'email' | 'formulario' | 'referido'; valor: string };
}

const noFutura = (c: AbstractControl) => (c.value && c.value > hoyIso() ? { futura: true } : null);

/** R2: pasar a postulado pide fecha (no futura) y canal (ui.md §4.6, maqueta «Marcar como postulada»). */
@Component({
  selector: 'b-dialogo-postular',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="confirmar()" novalidate>
      <div [class]="e.cabecera">
        <b-avatar [empresa]="ctx.empresa" [tamano]="40" />
        <div class="flex-1">
          <h2 [class]="e.titulo" id="dlg-postular">{{ 'dialogos.postular.titulo' | transloco }}</h2>
          <p [class]="e.subtitulo">{{ ctx.empresa }} · {{ ctx.titulo }}</p>
        </div>
      </div>
      <div [class]="e.cuerpo">
        <div [class]="e.campo">
          <label for="postular-fecha" [class]="e.etiqueta">{{
            'dialogos.postular.fecha' | transloco
          }}</label>
          <input hlmInput id="postular-fecha" type="date" formControlName="fecha" [max]="hoy" />
          @if (form.controls.fecha.hasError('futura')) {
            <span [class]="e.error" role="alert">{{ 'dialogos.postular.futura' | transloco }}</span>
          }
        </div>
        <fieldset [class]="e.campo">
          <legend [class]="e.etiqueta" class="mb-1.5">
            {{ 'dialogos.postular.canal' | transloco }}
          </legend>
          <div class="flex flex-wrap gap-2" role="radiogroup">
            @for (c of canales; track c) {
              <label
                class="inline-flex h-[34px] cursor-pointer items-center rounded-full border px-3.5"
                [class.border-acento]="form.value.tipo === c"
                [class.bg-acento-suave]="form.value.tipo === c"
                [class.text-acento-hover]="form.value.tipo === c"
                [class.font-semibold]="form.value.tipo === c"
              >
                <input type="radio" class="solo-lector" formControlName="tipo" [value]="c" />{{
                  'canales.' + c | transloco
                }}
              </label>
            }
          </div>
        </fieldset>
        <div [class]="e.campo">
          <label for="postular-detalle" [class]="e.etiqueta"
            >{{ 'dialogos.postular.detalle' | transloco }}
            <span class="font-normal text-tinta-suave">{{
              'dialogos.postular.opcional' | transloco
            }}</span></label
          >
          <input
            hlmInput
            id="postular-detalle"
            formControlName="detalle"
            [placeholder]="'dialogos.postular.detallePlaceholder' | transloco"
          />
        </div>
      </div>
      <div [class]="e.pie">
        <span class="flex-1 text-[12.5px] text-tinta-suave">{{
          'dialogos.postular.ayuda' | transloco
        }}</span>
        <button hlmBtn variant="outline" type="button" (click)="cerrar()">
          {{ 'dialogos.cancelar' | transloco }}
        </button>
        <button hlmBtn type="submit" [disabled]="form.invalid">
          {{ 'dialogos.postular.confirmar' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class DialogoPostular extends DialogoBase<
  ContextoPostulacion & { plataforma: string },
  DatosPostular
> {
  private readonly t = inject(TranslocoService);
  protected readonly e = ESTILO;
  protected readonly hoy = hoyIso();
  protected readonly canales = ['portal', 'email', 'formulario', 'referido'] as const;
  protected readonly form = new FormGroup({
    fecha: new FormControl(hoyIso(), {
      nonNullable: true,
      validators: [Validators.required, noFutura],
    }),
    tipo: new FormControl<DatosPostular['canal']['tipo']>('portal', { nonNullable: true }),
    detalle: new FormControl('', { nonNullable: true }),
  });

  protected confirmar(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const valor =
      v.detalle.trim() ||
      `${this.t.translate('canales.' + v.tipo)} · ${this.t.translate('plataformas.' + this.ctx.plataforma)}`;
    this.cerrar({ fechaPostulacion: v.fecha, canal: { tipo: v.tipo, valor } });
  }
}
