import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { AjustesStore } from './ajustes.store';

/** La contraseña de aplicación de Google: 16 letras, con o sin espacios. */
export const CLAVE_DE_APLICACION = /^\s*(?:[a-zA-Z]\s*){16}$/;

export const PASOS_GMAIL = 4;

/** Los enlaces de Google de cada paso (se abren en el navegador del sistema). */
export const ENLACES_GMAIL = {
  dosPasos: 'https://myaccount.google.com/signinoptions/twosv',
  contrasenas: 'https://myaccount.google.com/apppasswords',
} as const;

/**
 * «Conectar con Gmail» (docs/diseno/windows.md W5): 4 pasos para crear una contraseña de aplicación y pegarla.
 * La contraseña se borra del formulario apenas se envía (salga bien o mal), se prueba contra Gmail antes de
 * guardarse, queda en el llavero del sistema y la API nunca la devuelve. Cada persona conecta su propia cuenta.
 */
@Component({
  selector: 'b-guia-gmail',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    @if (paso() === 0) {
      <div class="flex flex-wrap items-center gap-2.5">
        <button
          hlmBtn
          type="button"
          data-conectar-gmail
          (click)="empezar()"
          [disabled]="store.apagada()"
        >
          {{
            (configurado() ? 'ajustes.gmail.cambiarCuenta' : 'ajustes.gmail.conectar') | transloco
          }}
        </button>
        <span class="text-[12.5px] text-tinta-suave">{{
          'ajustes.gmail.queHace' | transloco
        }}</span>
      </div>
    } @else {
      <div
        class="flex flex-col gap-3 rounded-[10px] border border-linea bg-superficie-panel px-4 py-3.5"
        role="group"
        aria-labelledby="gmail-paso-titulo"
        data-guia-gmail
      >
        <ol
          class="m-0 flex list-none gap-1.5 p-0"
          [attr.aria-label]="'ajustes.gmail.pasos' | transloco"
        >
          @for (n of numeros; track n) {
            <li
              class="h-1.5 flex-1 rounded-full"
              [class]="n <= paso() ? 'bg-acento' : 'bg-linea'"
              [attr.aria-current]="n === paso() ? 'step' : null"
            >
              <span class="solo-lector">{{
                'ajustes.gmail.pasoDe' | transloco: { n: n, total: total }
              }}</span>
            </li>
          }
        </ol>
        <p class="m-0 text-[12px] font-semibold tracking-wide text-tinta-suave uppercase">
          {{ 'ajustes.gmail.pasoDe' | transloco: { n: paso(), total: total } }}
        </p>
        <h3 id="gmail-paso-titulo" #titulo tabindex="-1" class="m-0 text-base font-extrabold">
          {{ 'ajustes.gmail.paso' + paso() + '.titulo' | transloco }}
        </h3>
        <p class="m-0 max-w-prose text-[13px] text-[#4A4440]" aria-live="polite">
          {{ 'ajustes.gmail.paso' + paso() + '.texto' | transloco }}
        </p>

        @switch (paso()) {
          @case (1) {
            <a
              hlmBtn
              variant="outline"
              class="self-start"
              [href]="enlaces.dosPasos"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ 'ajustes.gmail.paso1.abrir' | transloco
              }}<span class="solo-lector"> ({{ 'avisos.nuevaVentana' | transloco }})</span>
            </a>
          }
          @case (2) {
            <a
              hlmBtn
              variant="outline"
              class="self-start"
              [href]="enlaces.contrasenas"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ 'ajustes.gmail.paso2.abrir' | transloco
              }}<span class="solo-lector"> ({{ 'avisos.nuevaVentana' | transloco }})</span>
            </a>
            <p class="m-0 text-[12.5px] text-tinta-suave">
              {{ 'ajustes.gmail.paso2.noAparece' | transloco }}
            </p>
          }
          @case (3) {
            <ul class="m-0 flex flex-col gap-1 pl-5 text-[13px]">
              <li>{{ 'ajustes.gmail.paso3.nombre' | transloco }}</li>
              <li>{{ 'ajustes.gmail.paso3.copiar' | transloco }}</li>
              <li>{{ 'ajustes.gmail.paso3.unaVez' | transloco }}</li>
            </ul>
          }
          @case (4) {
            <form
              class="flex flex-col gap-3"
              [formGroup]="form"
              (ngSubmit)="guardar()"
              novalidate
              autocomplete="off"
            >
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{ 'ajustes.correo.usuario' | transloco }}</span>
                  <input
                    hlmInput
                    type="email"
                    formControlName="usuario"
                    autocomplete="off"
                    placeholder="tu.nombre@gmail.com"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{ 'ajustes.correo.clave' | transloco }}</span>
                  <input
                    hlmInput
                    type="password"
                    formControlName="clave"
                    autocomplete="new-password"
                    spellcheck="false"
                    aria-describedby="gmail-clave-ayuda"
                  />
                  <span id="gmail-clave-ayuda" class="text-[12px] text-tinta-suave">{{
                    'ajustes.correo.claveAyuda' | transloco
                  }}</span>
                </label>
              </div>
              <div class="flex flex-wrap items-center gap-2.5">
                <button
                  hlmBtn
                  type="submit"
                  [disabled]="form.invalid || probando() || store.apagada()"
                >
                  {{
                    (probando() ? 'ajustes.probando' : 'ajustes.gmail.probarYGuardar') | transloco
                  }}
                </button>
                <span role="status" class="text-[12.5px]" data-resultado="gmail">
                  @if (error(); as e) {
                    <span class="font-semibold text-error">{{ e }}</span>
                  }
                </span>
              </div>
              @if (error()) {
                <div
                  class="rounded-[8px] border border-aviso-borde bg-aviso-fondo px-3 py-2.5 text-aviso-tinta"
                  data-ayuda-gmail
                >
                  <p class="m-0 font-semibold">{{ 'ajustes.gmail.siFalla.titulo' | transloco }}</p>
                  <ul class="m-0 mt-1 flex flex-col gap-0.5 pl-5 text-[12.5px]">
                    <li>{{ 'ajustes.gmail.siFalla.copiar' | transloco }}</li>
                    <li>{{ 'ajustes.gmail.siFalla.cuenta' | transloco }}</li>
                    <li>{{ 'ajustes.gmail.siFalla.dosPasos' | transloco }}</li>
                    <li>{{ 'ajustes.gmail.siFalla.trabajo' | transloco }}</li>
                  </ul>
                </div>
              }
            </form>
          }
        }

        <div class="flex flex-wrap items-center gap-2 border-t border-linea pt-3">
          @if (paso() > 1) {
            <button hlmBtn variant="outline" size="sm" type="button" (click)="ir(paso() - 1)">
              {{ 'ajustes.gmail.atras' | transloco }}
            </button>
          }
          @if (paso() < total) {
            <button hlmBtn size="sm" type="button" (click)="ir(paso() + 1)">
              {{ 'ajustes.gmail.siguiente' | transloco }}
            </button>
          }
          <button hlmBtn variant="ghost" size="sm" type="button" class="ml-auto" (click)="cerrar()">
            {{ 'ajustes.gmail.cancelar' | transloco }}
          </button>
        </div>
      </div>
    }
  `,
})
export class GuiaGmail {
  protected readonly store = inject(AjustesStore);
  private readonly injector = inject(Injector);
  private readonly titulo = viewChild<ElementRef<HTMLElement>>('titulo');

  protected readonly total = PASOS_GMAIL;
  protected readonly numeros = Array.from({ length: PASOS_GMAIL }, (_, i) => i + 1);
  protected readonly enlaces = ENLACES_GMAIL;
  /** 0 = cerrada; 1 a 4 = el paso que se ve. */
  readonly paso = signal(0);
  protected readonly probando = computed(() => this.store.operacion().correo === 'probando');
  protected readonly configurado = computed(() => !!this.store.credenciales()?.correo.configurado);
  protected readonly error = computed(() => {
    const r = this.store.resultado().correo;
    return r?.tipo === 'error' ? r.mensaje || null : null;
  });

  protected readonly form = new FormGroup({
    usuario: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    clave: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(CLAVE_DE_APLICACION)],
    }),
  });

  empezar(): void {
    this.ir(1);
  }

  ir(n: number): void {
    this.paso.set(Math.max(0, Math.min(PASOS_GMAIL, n)));
    // El foco va al título del paso nuevo: el lector de pantalla lo lee y el teclado sigue desde ahí.
    afterNextRender(() => this.titulo()?.nativeElement.focus(), { injector: this.injector });
  }

  cerrar(): void {
    this.form.reset();
    this.paso.set(0);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const { usuario, clave } = this.form.getRawValue();
    // El secreto no se queda en pantalla, salga bien o mal.
    this.form.controls.clave.reset('');
    if (await this.store.guardarCorreo(usuario, clave)) this.cerrar();
  }
}
