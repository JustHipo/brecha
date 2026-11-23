import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { EntrevistaEntrada } from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { DialogoBase, ESTILO, type ContextoPostulacion } from './base';

/** R7: agendar entrevista; si no está en Entrevista, la postulación pasa ahí (ui.md §4.6). */
@Component({
  selector: 'b-dialogo-entrevista',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="confirmar()" novalidate>
      <div [class]="e.cabecera">
        <div class="flex-1">
          <h2 [class]="e.titulo">{{ 'dialogos.entrevista.titulo' | transloco }}</h2>
          <p [class]="e.subtitulo">{{ ctx.empresa }} · {{ ctx.titulo }}</p>
        </div>
      </div>
      <div [class]="e.cuerpo">
        <div [class]="e.campo">
          <label for="ent-fecha" [class]="e.etiqueta">{{
            'dialogos.entrevista.fecha' | transloco
          }}</label>
          <input hlmInput id="ent-fecha" type="datetime-local" formControlName="fecha" />
        </div>
        <div [class]="e.campo">
          <label for="ent-tipo" [class]="e.etiqueta">{{
            'dialogos.entrevista.tipo' | transloco
          }}</label>
          <select
            id="ent-tipo"
            formControlName="tipo"
            class="h-9 rounded-md border border-linea bg-fondo px-2"
          >
            @for (t of tipos; track t) {
              <option [value]="t">{{ 'entrevistas.' + t | transloco }}</option>
            }
          </select>
        </div>
        <div [class]="e.campo">
          <label for="ent-con" [class]="e.etiqueta">{{
            'dialogos.entrevista.con' | transloco
          }}</label>
          <input hlmInput id="ent-con" formControlName="con" />
        </div>
        <p [class]="e.ayuda">{{ 'dialogos.entrevista.ayuda' | transloco }}</p>
      </div>
      <div [class]="e.pie">
        <span class="flex-1"></span>
        <button hlmBtn variant="outline" type="button" (click)="cerrar()">
          {{ 'dialogos.cancelar' | transloco }}
        </button>
        <button hlmBtn type="submit" [disabled]="form.invalid">
          {{ 'dialogos.entrevista.confirmar' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class DialogoEntrevista extends DialogoBase<ContextoPostulacion, EntrevistaEntrada> {
  protected readonly e = ESTILO;
  protected readonly tipos = ['rrhh', 'tecnica', 'caso', 'final'] as const;
  protected readonly form = new FormGroup({
    fecha: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    tipo: new FormControl<EntrevistaEntrada['tipo']>('rrhh', { nonNullable: true }),
    con: new FormControl('', { nonNullable: true }),
  });

  protected confirmar(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.cerrar({
      fecha: new Date(v.fecha).toISOString(),
      tipo: v.tipo,
      ...(v.con.trim() ? { con: v.con.trim() } : {}),
    });
  }
}
