import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
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
    <form (ngSubmit)="confirmar()" novalidate>
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
            [formControl]="motivo"
            [placeholder]="'dialogos.cerrar.motivoPlaceholder' | transloco"
            required
          ></textarea>
        </div>
        @if (ctx.a === 'descartado') {
          <p [class]="e.ayuda">{{ 'dialogos.cerrar.avisoDescartado' | transloco }}</p>
        }
      </div>
      <div [class]="e.pie">
        <span class="flex-1"></span>
        <button hlmBtn variant="outline" type="button" (click)="cerrar()">
          {{ 'dialogos.cancelar' | transloco }}
        </button>
        <button hlmBtn type="submit" [disabled]="motivo.invalid">
          {{ 'dialogos.cerrar.confirmar' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class DialogoCerrar extends DialogoBase<
  ContextoPostulacion & { a: 'rechazado' | 'descartado' },
  { motivo: string }
> {
  protected readonly e = ESTILO;
  protected readonly motivo = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });

  protected confirmar(): void {
    if (this.motivo.valid) this.cerrar({ motivo: this.motivo.value.trim() });
  }
}
