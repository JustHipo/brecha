import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { EstadoPostulacion, SenalEntrada } from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { HlmTextarea } from '@brecha/ui/textarea';
import { DialogoBase, ESTILO, type ContextoPostulacion } from './base';

const ESTADOS: EstadoPostulacion[] = [
  'sin_decidir',
  'por_postular',
  'postulado',
  'en_proceso',
  'entrevista',
  'oferta',
  'aceptada',
  'rechazado',
  'descartado',
];

/** Señal a mano (F1): sirve para probar R11 y R13 antes de F2 (ui.md §4.4). */
@Component({
  selector: 'b-dialogo-senal',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmTextarea],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="confirmar()" novalidate>
      <div [class]="e.cabecera">
        <div class="flex-1">
          <h2 [class]="e.titulo">{{ 'dialogos.senal.titulo' | transloco }}</h2>
          <p [class]="e.subtitulo">{{ ctx.empresa }} · {{ ctx.titulo }}</p>
        </div>
      </div>
      <div [class]="e.cuerpo">
        <div [class]="e.campo">
          <label for="senal-fuente" [class]="e.etiqueta">{{
            'dialogos.senal.fuente' | transloco
          }}</label>
          <select
            id="senal-fuente"
            formControlName="fuente"
            class="h-9 rounded-md border border-linea bg-fondo px-2"
          >
            @for (f of fuentes; track f) {
              <option [value]="f">{{ 'fuentes.' + f | transloco }}</option>
            }
          </select>
        </div>
        <div [class]="e.campo">
          <label for="senal-resumen" [class]="e.etiqueta">{{
            'dialogos.senal.resumen' | transloco
          }}</label>
          <textarea
            hlmTextarea
            id="senal-resumen"
            rows="2"
            formControlName="resumen"
            [placeholder]="'dialogos.senal.resumenPlaceholder' | transloco"
          ></textarea>
        </div>
        <div [class]="e.campo">
          <label for="senal-estado" [class]="e.etiqueta">{{
            'dialogos.senal.estadoSugerido' | transloco
          }}</label>
          <select
            id="senal-estado"
            formControlName="estadoSugerido"
            class="h-9 rounded-md border border-linea bg-fondo px-2"
          >
            <option value="">{{ 'dialogos.senal.ninguno' | transloco }}</option>
            @for (s of estados; track s) {
              <option [value]="s">{{ 'estados.' + s | transloco }}</option>
            }
          </select>
        </div>
        <div [class]="e.campo">
          <label for="senal-confianza" [class]="e.etiqueta"
            >{{ 'dialogos.senal.confianza' | transloco }}: {{ form.value.confianza }}</label
          >
          <input
            id="senal-confianza"
            type="range"
            min="0"
            max="1"
            step="0.05"
            formControlName="confianza"
            class="accent-[var(--acento)]"
          />
        </div>
        <p [class]="e.ayuda">{{ 'dialogos.senal.ayuda' | transloco }}</p>
      </div>
      <div [class]="e.pie">
        <span class="flex-1"></span>
        <button hlmBtn variant="outline" type="button" (click)="cerrar()">
          {{ 'dialogos.cancelar' | transloco }}
        </button>
        <button hlmBtn type="submit" [disabled]="form.invalid">
          {{ 'dialogos.senal.confirmar' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class DialogoSenal extends DialogoBase<ContextoPostulacion, SenalEntrada> {
  protected readonly e = ESTILO;
  protected readonly fuentes = ['manual', 'correo', 'plataforma', 'ia'] as const;
  protected readonly estados = ESTADOS;
  protected readonly form = new FormGroup({
    fuente: new FormControl<SenalEntrada['fuente']>('manual', { nonNullable: true }),
    resumen: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    estadoSugerido: new FormControl<EstadoPostulacion | ''>('', { nonNullable: true }),
    confianza: new FormControl(0.9, { nonNullable: true }),
  });

  protected confirmar(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.cerrar({
      fuente: v.fuente,
      resumen: v.resumen.trim(),
      confianza: Number(v.confianza),
      ...(v.estadoSugerido ? { estadoSugerido: v.estadoSugerido } : {}),
    });
  }
}
