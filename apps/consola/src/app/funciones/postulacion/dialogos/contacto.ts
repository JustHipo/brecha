import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
} from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ContactoEntrada } from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { DialogoBase, ESTILO, type ContextoPostulacion } from './base';

const unoDeLosDos = (g: AbstractControl) =>
  g.value.email?.trim() || g.value.linkedin?.trim() ? null : { falta: true };

/** Contacto: nombre y al menos un correo o un perfil de LinkedIn (ui.md §4.6). */
@Component({
  selector: 'b-dialogo-contacto',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="confirmar()" novalidate>
      <div [class]="e.cabecera">
        <div class="flex-1">
          <h2 [class]="e.titulo">{{ 'dialogos.contacto.titulo' | transloco }}</h2>
          <p [class]="e.subtitulo">{{ ctx.empresa }}</p>
        </div>
      </div>
      <div [class]="e.cuerpo">
        @for (c of campos; track c) {
          <div [class]="e.campo">
            <label [for]="'contacto-' + c" [class]="e.etiqueta">{{
              'dialogos.contacto.' + c | transloco
            }}</label>
            <input
              hlmInput
              [id]="'contacto-' + c"
              [formControlName]="c"
              [type]="c === 'email' ? 'email' : 'text'"
            />
          </div>
        }
        <p [class]="e.ayuda">{{ 'dialogos.contacto.ayuda' | transloco }}</p>
      </div>
      <div [class]="e.pie">
        <span class="flex-1"></span>
        <button hlmBtn variant="outline" type="button" (click)="cerrar()">
          {{ 'dialogos.cancelar' | transloco }}
        </button>
        <button hlmBtn type="submit" [disabled]="form.invalid">
          {{ 'dialogos.contacto.confirmar' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class DialogoContacto extends DialogoBase<ContextoPostulacion, ContactoEntrada> {
  protected readonly e = ESTILO;
  protected readonly campos = ['nombre', 'rol', 'email', 'linkedin'] as const;
  protected readonly form = new FormGroup(
    {
      nombre: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/\S/)],
      }),
      rol: new FormControl('', { nonNullable: true }),
      email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
      linkedin: new FormControl('', { nonNullable: true }),
    },
    { validators: unoDeLosDos },
  );

  protected confirmar(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const limpio = Object.fromEntries(
      Object.entries(v)
        .map(([k, x]) => [k, x.trim()])
        .filter(([, x]) => x),
    ) as unknown as ContactoEntrada;
    this.cerrar(limpio);
  }
}
