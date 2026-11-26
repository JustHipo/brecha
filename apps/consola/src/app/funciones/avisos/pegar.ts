import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { HlmTextarea } from '@brecha/ui/textarea';
import type { AvisoPegado, ModalidadIa, PlataformaIa } from '../../nucleo/api/ia.service';
import { MODALIDADES, PLATAFORMAS } from '../bandeja/dialogos';
import { DialogoBase, ESTILO } from '../postulacion/dialogos/base';

/** Pegar un aviso a mano: el análisis corre en segundo plano en la API de IA. */
@Component({
  selector: 'b-dialogo-pegar-aviso',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput, HlmTextarea],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="enviar()" novalidate>
      <div [class]="e.cabecera">
        <div class="flex-1">
          <h2 [class]="e.titulo">{{ 'avisos.pegarTitulo' | transloco }}</h2>
          <p [class]="e.subtitulo">{{ 'avisos.pegarTexto' | transloco }}</p>
        </div>
      </div>
      <div [class]="e.cuerpo">
        @for (c of textos; track c.nombre) {
          <div [class]="e.campo">
            <label [for]="'pa-' + c.nombre" [class]="e.etiqueta">{{
              c.etiqueta | transloco
            }}</label>
            <input
              hlmInput
              [id]="'pa-' + c.nombre"
              [formControlName]="c.nombre"
              [type]="c.tipo"
              [attr.aria-invalid]="invalido(c.nombre)"
              [attr.aria-describedby]="invalido(c.nombre) ? 'pa-' + c.nombre + '-error' : null"
            />
            @if (invalido(c.nombre)) {
              <span [id]="'pa-' + c.nombre + '-error'" [class]="e.error" role="alert">{{
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
            <label for="pa-plataforma" [class]="e.etiqueta">{{
              'nueva.plataforma' | transloco
            }}</label>
            <select
              id="pa-plataforma"
              formControlName="plataforma"
              class="h-9 rounded-md border border-linea bg-fondo px-2"
            >
              @for (p of plataformas; track p) {
                <option [value]="p">{{ 'plataformas.' + p | transloco }}</option>
              }
            </select>
          </div>
          <div [class]="e.campo">
            <label for="pa-modalidad" [class]="e.etiqueta">{{
              'nueva.modalidad' | transloco
            }}</label>
            <select
              id="pa-modalidad"
              formControlName="modalidad"
              class="h-9 rounded-md border border-linea bg-fondo px-2"
            >
              @for (m of modalidades; track m) {
                <option [value]="m">{{ 'modalidades.' + m | transloco }}</option>
              }
            </select>
          </div>
        </div>
        <div [class]="e.campo">
          <label for="pa-stack" [class]="e.etiqueta">{{ 'avisos.stack' | transloco }}</label>
          <input hlmInput id="pa-stack" formControlName="stack" aria-describedby="pa-stack-ayuda" />
          <span id="pa-stack-ayuda" class="text-[12.5px] text-tinta-suave">{{
            'avisos.stackAyuda' | transloco
          }}</span>
        </div>
        <div [class]="e.campo">
          <label for="pa-texto" [class]="e.etiqueta">{{ 'avisos.texto' | transloco }}</label>
          <textarea
            hlmTextarea
            id="pa-texto"
            rows="6"
            formControlName="texto"
            [attr.aria-invalid]="invalido('texto')"
            [attr.aria-describedby]="invalido('texto') ? 'pa-texto-error' : null"
          ></textarea>
          @if (invalido('texto')) {
            <span id="pa-texto-error" [class]="e.error" role="alert">{{
              'avisos.textoCorto' | transloco
            }}</span>
          }
        </div>
      </div>
      <div [class]="e.pie">
        <span class="flex-1"></span>
        <button hlmBtn variant="outline" type="button" (click)="cerrar()">
          {{ 'dialogos.cancelar' | transloco }}
        </button>
        <button hlmBtn type="submit">{{ 'avisos.pegarConfirmar' | transloco }}</button>
      </div>
    </form>
  `,
})
export class DialogoPegarAviso extends DialogoBase<object, AvisoPegado> {
  protected readonly e = ESTILO;
  protected readonly plataformas = PLATAFORMAS;
  protected readonly modalidades = MODALIDADES;
  protected readonly textos = [
    { nombre: 'titulo', etiqueta: 'nueva.tituloCargo', tipo: 'text' },
    { nombre: 'empresa', etiqueta: 'nueva.empresa', tipo: 'text' },
    { nombre: 'url', etiqueta: 'nueva.url', tipo: 'url' },
  ] as const;
  protected readonly form = new FormGroup({
    titulo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    empresa: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^https?:\/\/\S+$/)],
    }),
    plataforma: new FormControl<PlataformaIa>('otra', { nonNullable: true }),
    modalidad: new FormControl<ModalidadIa>('no_indica', { nonNullable: true }),
    stack: new FormControl('', { nonNullable: true }),
    texto: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(20), Validators.maxLength(20000)],
    }),
  });

  protected invalido(nombre: 'titulo' | 'empresa' | 'url' | 'texto'): boolean {
    const c = this.form.controls[nombre];
    return c.invalid && (c.touched || c.dirty);
  }

  protected enviar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.form.getRawValue().texto.trim().length < 20) return;
    const v = this.form.getRawValue();
    const stack = v.stack
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40);
    this.cerrar({
      url: v.url.trim(),
      titulo: v.titulo.trim(),
      empresa: v.empresa.trim(),
      texto: v.texto.trim(),
      plataforma: v.plataforma,
      modalidad: v.modalidad,
      ...(stack.length ? { stack } : {}),
    });
  }
}
