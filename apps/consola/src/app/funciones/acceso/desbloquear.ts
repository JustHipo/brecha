import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { HlmLabel } from '@brecha/ui/label';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../nucleo/api/api.service';
import { SesionLocal } from '../../nucleo/acceso/sesion';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';

/** Desbloquear (ui.md §4.1): solo existe con clave local. Un único mensaje si la clave es mala. */
@Component({
  selector: 'b-desbloquear',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput, HlmLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid min-h-dvh place-items-center bg-superficie p-6' },
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="entrar()"
      class="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-linea bg-fondo p-7 shadow-[0_20px_50px_rgb(38_33_30/0.12)]"
      novalidate
    >
      <div class="flex items-center gap-2.5">
        <span
          class="barra-terracota grid size-9 place-items-center rounded-lg font-titulo font-extrabold"
          aria-hidden="true"
          >B</span
        >
        <h1 class="m-0 text-xl font-extrabold">{{ 'acceso.titulo' | transloco }}</h1>
      </div>
      <p class="m-0 text-tinta-suave">{{ 'acceso.texto' | transloco }}</p>
      <div class="flex flex-col gap-1.5">
        <label hlmLabel for="clave">{{ 'acceso.clave' | transloco }}</label>
        <input
          hlmInput
          id="clave"
          type="password"
          autocomplete="current-password"
          formControlName="clave"
          [attr.aria-invalid]="mala()"
          aria-describedby="clave-error"
          #campo
        />
        @if (mala()) {
          <span id="clave-error" role="alert" class="text-[12.5px] text-error">{{
            'acceso.incorrecta' | transloco
          }}</span>
        }
      </div>
      <button hlmBtn type="submit" [disabled]="form.invalid || enviando()">
        {{ 'acceso.entrar' | transloco }}
      </button>
    </form>
  `,
})
export class Desbloquear {
  readonly volver = input<string>();
  private readonly api = inject(Api);
  private readonly sesion = inject(SesionLocal);
  private readonly router = inject(Router);
  protected readonly form = new FormGroup({
    clave: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  protected readonly mala = signal(false);
  protected readonly enviando = signal(false);
  private readonly campo = viewChild.required<ElementRef<HTMLInputElement>>('campo');

  constructor() {
    afterNextRender(() => this.campo().nativeElement.focus());
  }

  protected async entrar(): Promise<void> {
    if (this.form.invalid) return;
    this.enviando.set(true);
    this.mala.set(false);
    try {
      const s = await firstValueFrom(this.api.desbloquear(this.form.getRawValue().clave));
      this.sesion.guardar(s.token, s.expiraEn);
      await this.router.navigateByUrl(this.volver() || '/tablero');
    } catch (e) {
      this.mala.set(e instanceof ErrorDeApi && e.codigo === 'CLAVE_INVALIDA');
      if (!this.mala()) throw e;
    } finally {
      this.enviando.set(false);
    }
  }
}
