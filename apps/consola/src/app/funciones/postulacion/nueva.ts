import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { CrearPostulacion } from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../nucleo/api/api.service';
import { Avisos } from '../../nucleo/avisos';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { TableroStore } from '../tablero/tablero.store';
import { hoyIso } from './dialogos/base';

type Plataforma = CrearPostulacion['aviso']['plataforma'];
type Modalidad = NonNullable<CrearPostulacion['aviso']['modalidad']>;
type EstadoInicial = NonNullable<CrearPostulacion['estado']>;
type TipoCanal = NonNullable<CrearPostulacion['canal']>['tipo'];

/** Nueva postulación (ui.md §4.5): formulario reactivo tipado con validación en vivo. */
@Component({
  selector: 'b-nueva',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5 px-6 pt-[22px] pb-10' },
  template: `
    <h1 class="titulo-pagina m-0">{{ 'nueva.titulo' | transloco }}</h1>
    <form
      [formGroup]="form"
      (ngSubmit)="crear()"
      class="grid max-w-3xl grid-cols-2 gap-4"
      novalidate
    >
      @for (c of textos; track c.nombre) {
        <div class="flex flex-col gap-1.5" [class.col-span-2]="c.ancho">
          <label [for]="'n-' + c.nombre" class="font-semibold">{{ c.etiqueta | transloco }}</label>
          <input
            hlmInput
            [id]="'n-' + c.nombre"
            [formControlName]="c.nombre"
            [type]="c.tipo"
            [attr.aria-invalid]="invalido(c.nombre)"
            [attr.aria-describedby]="'n-' + c.nombre + '-error'"
          />
          @if (invalido(c.nombre)) {
            <span [id]="'n-' + c.nombre + '-error'" class="text-[12.5px] text-error" role="alert">{{
              (c.nombre === 'url' && form.controls.url.hasError('pattern')
                ? 'nueva.urlInvalida'
                : 'nueva.obligatorio'
              ) | transloco
            }}</span>
          }
        </div>
      }
      <div class="flex flex-col gap-1.5">
        <label for="n-plataforma" class="font-semibold">{{ 'nueva.plataforma' | transloco }}</label>
        <select
          id="n-plataforma"
          formControlName="plataforma"
          class="h-9 rounded-md border border-linea bg-fondo px-2"
        >
          @for (p of plataformas; track p) {
            <option [value]="p">{{ 'plataformas.' + p | transloco }}</option>
          }
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="n-modalidad" class="font-semibold">{{ 'nueva.modalidad' | transloco }}</label>
        <select
          id="n-modalidad"
          formControlName="modalidad"
          class="h-9 rounded-md border border-linea bg-fondo px-2"
        >
          @for (m of modalidades; track m) {
            <option [value]="m">{{ 'modalidades.' + m | transloco }}</option>
          }
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="n-cierre" class="font-semibold">{{ 'nueva.cierre' | transloco }}</label>
        <input hlmInput id="n-cierre" type="date" formControlName="cierre" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="n-estado" class="font-semibold">{{ 'nueva.estado' | transloco }}</label>
        <select
          id="n-estado"
          formControlName="estado"
          class="h-9 rounded-md border border-linea bg-fondo px-2"
        >
          @for (e of estados; track e) {
            <option [value]="e">{{ 'estados.' + e | transloco }}</option>
          }
        </select>
      </div>
      @if (form.value.estado === 'postulado') {
        <div class="flex flex-col gap-1.5">
          <label for="n-fecha" class="font-semibold">{{
            'dialogos.postular.fecha' | transloco
          }}</label>
          <input hlmInput id="n-fecha" type="date" formControlName="fechaPostulacion" [max]="hoy" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="n-canal" class="font-semibold">{{
            'dialogos.postular.canal' | transloco
          }}</label>
          <span class="flex gap-2">
            <select
              id="n-canal"
              formControlName="canalTipo"
              class="h-9 rounded-md border border-linea bg-fondo px-2"
            >
              @for (c of canales; track c) {
                <option [value]="c">{{ 'canales.' + c | transloco }}</option>
              }
            </select>
            <input
              hlmInput
              class="flex-1"
              formControlName="canalValor"
              [attr.aria-label]="'dialogos.postular.detalle' | transloco"
            />
          </span>
        </div>
      }
      <fieldset class="col-span-2 flex flex-col gap-1.5">
        <legend class="mb-1.5 font-semibold">{{ 'nueva.sueldo' | transloco }}</legend>
        <span class="flex gap-2">
          <input
            hlmInput
            type="number"
            min="0"
            class="w-48"
            formControlName="monto"
            [attr.aria-label]="'nueva.monto' | transloco"
          />
          <select
            formControlName="moneda"
            class="h-9 rounded-md border border-linea bg-fondo px-2"
            [attr.aria-label]="'nueva.moneda' | transloco"
          >
            <option value="CLP">CLP</option>
            <option value="USD">USD</option>
          </select>
        </span>
      </fieldset>

      @if (existente(); as id) {
        <p
          class="col-span-2 m-0 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
          role="alert"
        >
          {{ 'nueva.yaExiste' | transloco }}
          <a [routerLink]="['/postulaciones', id]" class="font-semibold text-aviso-tinta">{{
            'nueva.verExistente' | transloco
          }}</a>
        </p>
      }

      <div class="col-span-2 flex justify-end gap-2">
        <a hlmBtn variant="outline" routerLink="/tablero">{{ 'nueva.cancelar' | transloco }}</a>
        <button hlmBtn type="submit" [disabled]="enviando()">
          {{ 'nueva.crear' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class NuevaPostulacion {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly avisos = inject(Avisos);
  private readonly tablero = inject(TableroStore);

  protected readonly hoy = hoyIso();
  protected readonly plataformas: Plataforma[] = [
    'linkedin',
    'trabajando',
    'getonboard',
    'computrabajo',
    'chiletrabajos',
    'indeed',
    'sitio_empresa',
    'otra',
  ];
  protected readonly modalidades: Modalidad[] = ['remoto', 'hibrido', 'presencial', 'no_indica'];
  protected readonly estados: EstadoInicial[] = ['sin_decidir', 'por_postular', 'postulado'];
  protected readonly canales: TipoCanal[] = ['portal', 'email', 'formulario', 'referido'];
  protected readonly textos = [
    { nombre: 'titulo', etiqueta: 'nueva.tituloCargo', tipo: 'text', ancho: true },
    { nombre: 'empresa', etiqueta: 'nueva.empresa', tipo: 'text', ancho: false },
    { nombre: 'ubicacion', etiqueta: 'nueva.ubicacion', tipo: 'text', ancho: false },
    { nombre: 'url', etiqueta: 'nueva.url', tipo: 'url', ancho: true },
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
    ubicacion: new FormControl('', { nonNullable: true }),
    plataforma: new FormControl<Plataforma>('linkedin', { nonNullable: true }),
    modalidad: new FormControl<Modalidad>('no_indica', { nonNullable: true }),
    cierre: new FormControl('', { nonNullable: true }),
    estado: new FormControl<EstadoInicial>('sin_decidir', { nonNullable: true }),
    fechaPostulacion: new FormControl(hoyIso(), { nonNullable: true }),
    canalTipo: new FormControl<TipoCanal>('portal', { nonNullable: true }),
    canalValor: new FormControl('', { nonNullable: true }),
    monto: new FormControl<number | null>(null),
    moneda: new FormControl<'CLP' | 'USD'>('CLP', { nonNullable: true }),
  });
  protected readonly enviando = signal(false);
  protected readonly existente = signal<string | null>(null);

  protected invalido(nombre: 'titulo' | 'empresa' | 'url' | 'ubicacion'): boolean {
    const c = this.form.controls[nombre];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async crear(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const cuerpo: CrearPostulacion = {
      aviso: {
        titulo: v.titulo.trim(),
        empresa: v.empresa.trim(),
        url: v.url.trim(),
        plataforma: v.plataforma,
        modalidad: v.modalidad,
        ...(v.ubicacion.trim() ? { ubicacion: v.ubicacion.trim() } : {}),
        ...(v.cierre ? { cierre: v.cierre } : {}),
      },
      estado: v.estado,
      ...(v.monto ? { sueldoPretendido: { monto: Number(v.monto), moneda: v.moneda } } : {}),
      ...(v.estado === 'postulado'
        ? {
            fechaPostulacion: v.fechaPostulacion,
            canal: { tipo: v.canalTipo, valor: v.canalValor.trim() || v.plataforma },
          }
        : {}),
    };
    this.enviando.set(true);
    this.existente.set(null);
    try {
      const d = await firstValueFrom(this.api.crear(cuerpo));
      this.tablero.actualizar(d);
      this.avisos.exito('nueva.creada');
      await this.router.navigate(['/postulaciones', d.id]);
    } catch (e) {
      if (e instanceof ErrorDeApi && e.codigo === 'YA_EXISTE' && e.existenteId)
        this.existente.set(e.existenteId);
      else this.avisos.error(e);
    } finally {
      this.enviando.set(false);
    }
  }
}
