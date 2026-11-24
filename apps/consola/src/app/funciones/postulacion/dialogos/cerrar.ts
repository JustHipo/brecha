import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmTextarea } from '@brecha/ui/textarea';
import { Avatar } from '../../../compartido/piezas';
import { DialogoBase, ESTILO, type ContextoPostulacion } from './base';

/** R5: rechazado y descartado piden motivo; descartado avisa la prioridad baja (ui.md §4.6). */
@Component({
  selector: 'b-dialogo-cerrar',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmTextarea, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="confirmar()" novalidate>
      <div [class]="e.cabecera">
        <b-avatar [empresa]="ctx.empresa" [tamano]="40" />
        <div class="flex-1">
          <h2 [class]="e.titulo">
            {{
              (ctx.a === 'rechazado'
                ? 'dialogos.cerrar.tituloRechazado'
                : 'dialogos.cerrar.tituloDescartado'
              ) | transloco
            }}
          </h2>
          <p [class]="e.subtitulo">{{ ctx.empresa }} · {{ ctx.titulo }}</p>
        </div>
      </div>
      <div [class]="e.cuerpo">
        <div [class]="e.campo">
          <label for="cerrar-motivo" [class]="e.etiqueta">{{
            'dialogos.cerrar.motivo' | transloco
          }}</label>
          <textarea
            hlmTextarea
            id="cerrar-motivo"
            rows="3"
            formControlName="motivo"
            [placeholder]="'dialogos.cerrar.motivoPlaceholder' | transloco"
            required
          ></textarea>
        </div>
        @if (ctx.a === 'descartado') {
          <p [class]="e.ayuda">{{ 'dialogos.cerrar.avisoDescartado' | transloco }}</p>
        }
        @if (ctx.pasos?.length) {
          <div
            class="flex flex-col gap-1.5 rounded-[10px] bg-acento-suave px-3 py-2.5"
            data-cerrar-pasos
          >
            <label class="flex items-start gap-2 text-[13px] font-semibold text-tinta">
              <input
                type="checkbox"
                formControlName="descartarPasos"
                class="mt-0.5 accent-acento"
                id="cerrar-descartar-pasos"
              />
              <span>{{
                'dialogos.cerrar.descartarPasos' | transloco: { n: ctx.pasos.length }
              }}</span>
            </label>
            <ul class="m-0 list-disc pl-9 text-[12.5px] text-tinta-suave">
              @for (p of ctx.pasos; track $index) {
                <li>{{ p }}</li>
              }
            </ul>
          </div>
        }
      </div>
      <div [class]="e.pie">
        <span class="flex-1"></span>
        <button hlmBtn variant="outline" type="button" (click)="cerrar()">
          {{ 'dialogos.cancelar' | transloco }}
        </button>
        <button hlmBtn type="submit" [disabled]="form.invalid">
          {{ 'dialogos.cerrar.confirmar' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class DialogoCerrar extends DialogoBase<
  ContextoPostulacion & { a: 'rechazado' | 'descartado'; pasos?: string[] },
  { motivo: string; descartarPasos?: boolean }
> {
  protected readonly e = ESTILO;
  protected readonly form = new FormGroup({
    motivo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    // R17: marcado por defecto; si lo desmarcas, los pasos siguen pendientes en la cerrada.
    descartarPasos: new FormControl(true, { nonNullable: true }),
  });

  protected confirmar(): void {
    if (!this.form.valid) return;
    const { motivo, descartarPasos } = this.form.getRawValue();
    this.cerrar({
      motivo: motivo.trim(),
      ...(this.ctx.pasos?.length && descartarPasos ? { descartarPasos: true } : {}),
    });
  }
}
