import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import type { TipoDeCredencial } from '../../nucleo/api/ia.service';
import { Formato, IDIOMAS, type Idioma } from '../../nucleo/idioma/idioma';
import { DialogoConfirmar } from '../bandeja/dialogos';
import { EstadoIaStore } from '../conexiones/estado-ia.store';
import { Dialogos } from '../postulacion/dialogos/dialogos.service';
import { AjustesStore, type Operacion, type Resultado } from './ajustes.store';
import { GuiaGmail } from './guia-gmail';

const TARJETA =
  'flex flex-col gap-3 rounded-[12px] border border-linea bg-fondo px-5 py-4 shadow-tarjeta';

/**
 * Ajustes (ui.md §5): credenciales de Gmail (con la guía «Conectar con Gmail») y OpenAI, idioma y la
 * frecuencia del vigía. Las credenciales se prueban antes de guardarse y nunca vuelven a mostrarse.
 */
@Component({
  selector: 'b-ajustes',
  imports: [NgTemplateOutlet, ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput, GuiaGmail],
  providers: [AjustesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <div>
      <h1 class="titulo-pagina m-0">{{ 'ajustes.titulo' | transloco }}</h1>
      <p class="mt-0.5 mb-0 text-tinta-suave">{{ 'ajustes.resumen' | transloco }}</p>
    </div>

    @if (store.error(); as e) {
      <div
        role="alert"
        class="flex max-w-3xl items-center gap-3 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
      >
        <span class="flex-1">{{ e.clave | transloco }}</span>
        <button hlmBtn variant="outline" size="sm" type="button" (click)="store.cargar()">
          {{ 'tablero.reintentar' | transloco }}
        </button>
      </div>
    }

    <section [class]="tarjeta" class="max-w-3xl" aria-labelledby="aj-correo">
      <div class="flex items-center gap-2">
        <h2 id="aj-correo" class="m-0 flex-1 text-lg font-extrabold">
          {{ 'ajustes.correo.titulo' | transloco }}
        </h2>
        <ng-container
          *ngTemplateOutlet="estado; context: { ok: store.credenciales()?.correo?.configurado }"
        />
      </div>
      @if (store.credenciales()?.correo; as c) {
        @if (c.configurado && c.usuario) {
          <p class="m-0" data-usuario-correo>
            {{ 'ajustes.correo.conectado' | transloco: { usuario: c.usuario } }}
          </p>
        }
      }
      <p class="m-0 text-[12.5px] text-[#4A4440]">{{ 'ajustes.correo.explicacion' | transloco }}</p>
      <b-guia-gmail />
      <div class="flex flex-wrap items-center gap-2.5">
        @if (configurado('correo')) {
          <button
            hlmBtn
            variant="outline"
            type="button"
            [disabled]="op('correo') !== 'quieta' || store.apagada()"
            (click)="borrar('correo')"
          >
            {{ (op('correo') === 'borrando' ? 'ajustes.borrando' : 'ajustes.borrar') | transloco }}
          </button>
        }
        <span role="status" class="text-[12.5px]" data-resultado="correo">
          @if (res('correo'); as r) {
            @if (r.tipo === 'guardada') {
              <span class="font-semibold text-[#1D6638]">{{ 'ajustes.guardada' | transloco }}</span>
            } @else if (r.tipo === 'borrada') {
              <span class="font-semibold text-[#1D6638]">{{ 'ajustes.borrada' | transloco }}</span>
            }
          }
        </span>
      </div>
    </section>

    <section [class]="tarjeta" class="max-w-3xl" aria-labelledby="aj-openai">
      <div class="flex items-center gap-2">
        <h2 id="aj-openai" class="m-0 flex-1 text-lg font-extrabold">
          {{ 'ajustes.openai.titulo' | transloco }}
        </h2>
        <ng-container
          *ngTemplateOutlet="estado; context: { ok: store.credenciales()?.openai?.configurado }"
        />
      </div>
      <p class="m-0 text-[12.5px] text-[#4A4440]">
        {{ 'ajustes.openai.explicacion' | transloco }}
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          class="font-semibold text-acento underline-offset-2 hover:underline"
          >{{ 'ajustes.openai.crearLlave' | transloco
          }}<span class="solo-lector"> ({{ 'avisos.nuevaVentana' | transloco }})</span></a
        >
      </p>
      <form
        class="flex flex-col gap-3"
        [formGroup]="openai"
        (ngSubmit)="guardarOpenai()"
        novalidate
        autocomplete="off"
      >
        <label class="flex max-w-md flex-col gap-1">
          <span class="font-semibold">{{ 'ajustes.openai.llave' | transloco }}</span>
          <input
            hlmInput
            type="password"
            formControlName="llave"
            autocomplete="new-password"
            spellcheck="false"
            placeholder="sk-…"
          />
        </label>
        <ng-container *ngTemplateOutlet="acciones; context: { tipo: 'openai', form: openai }" />
      </form>
    </section>

    <section [class]="tarjeta" class="max-w-3xl" aria-labelledby="aj-general">
      <h2 id="aj-general" class="m-0 text-lg font-extrabold">
        {{ 'ajustes.general' | transloco }}
      </h2>
      <label class="flex max-w-xs flex-col gap-1">
        <span class="font-semibold">{{ 'ajustes.idioma' | transloco }}</span>
        <select
          class="h-9 rounded-md border border-linea bg-fondo px-2"
          (change)="cambiarIdioma($any($event.target).value)"
        >
          @for (i of idiomas; track i) {
            <option [value]="i" [selected]="idioma() === i">
              {{ 'ajustes.idiomas.' + i | transloco }}
            </option>
          }
        </select>
      </label>
      <p class="m-0" data-vigia>
        <span class="font-semibold">{{ 'ajustes.vigia' | transloco }}:</span>
        {{
          store.vigiaMinutos() !== null
            ? ('conexiones.correo.minutos' | transloco: { n: store.vigiaMinutos() })
            : ('ajustes.vigiaSinDato' | transloco)
        }}
        <span class="text-tinta-suave">· {{ 'ajustes.vigiaAyuda' | transloco }}</span>
      </p>
    </section>

    <ng-template #estado let-ok="ok">
      <span
        class="flex items-center gap-1.5 font-semibold"
        [class]="ok ? 'text-[#1D6638]' : 'text-aviso-tinta'"
      >
        <span class="size-2 rounded-full bg-current" aria-hidden="true"></span>
        {{ (ok ? 'conexiones.configurado' : 'conexiones.sinConfigurar') | transloco }}
      </span>
    </ng-template>

    <ng-template #acciones let-tipo="tipo" let-form="form">
      <div class="flex flex-wrap items-center gap-2.5">
        <button
          hlmBtn
          type="submit"
          [disabled]="form.invalid || op(tipo) !== 'quieta' || store.apagada()"
        >
          {{ (op(tipo) === 'probando' ? 'ajustes.probando' : 'ajustes.guardar') | transloco }}
        </button>
        @if (configurado(tipo)) {
          <button
            hlmBtn
            variant="outline"
            type="button"
            [disabled]="op(tipo) !== 'quieta' || store.apagada()"
            (click)="borrar(tipo)"
          >
            {{ (op(tipo) === 'borrando' ? 'ajustes.borrando' : 'ajustes.borrar') | transloco }}
          </button>
        }
        <span role="status" class="text-[12.5px]" [attr.data-resultado]="tipo">
          @if (res(tipo); as r) {
            @switch (r.tipo) {
              @case ('guardada') {
                <span class="font-semibold text-[#1D6638]">{{
                  'ajustes.guardada' | transloco
                }}</span>
              }
              @case ('borrada') {
                <span class="font-semibold text-[#1D6638]">{{
                  'ajustes.borrada' | transloco
                }}</span>
              }
              @case ('error') {
                <span class="font-semibold text-error">{{
                  $any(r).mensaje || ($any(r).error.clave | transloco)
                }}</span>
              }
            }
          }
        </span>
      </div>
    </ng-template>
  `,
})
export class AjustesPagina {
  protected readonly store = inject(AjustesStore);
  private readonly estadoIa = inject(EstadoIaStore);
  private readonly formato = inject(Formato);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogos = inject(Dialogos);
  protected readonly tarjeta = TARJETA;
  protected readonly idiomas = IDIOMAS;
  protected readonly idioma = signal(this.transloco.getActiveLang());

  protected readonly openai = new FormGroup({
    llave: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\s*sk-\S{8,}\s*$/)],
    }),
  });

  constructor() {
    void this.store.cargar();
    if (!this.estadoIa.conexiones()) void this.estadoIa.cargar();
    this.transloco.langChanges$.subscribe((l) => this.idioma.set(l));
  }

  protected op(tipo: TipoDeCredencial): Operacion {
    return this.store.operacion()[tipo];
  }

  protected res(tipo: TipoDeCredencial): Resultado | null {
    return this.store.resultado()[tipo];
  }

  protected configurado(tipo: TipoDeCredencial): boolean {
    return !!this.store.credenciales()?.[tipo].configurado;
  }

  protected cambiarIdioma(i: Idioma): void {
    this.formato.cambiarIdioma(i);
  }

  protected async guardarOpenai(): Promise<void> {
    if (this.openai.invalid) return;
    const { llave } = this.openai.getRawValue();
    this.openai.reset();
    await this.store.guardarOpenai(llave);
  }

  protected async borrar(tipo: TipoDeCredencial): Promise<void> {
    const ok = await this.dialogos.abrir<boolean, object>(DialogoConfirmar, {
      titulo: `ajustes.${tipo}.borrarTitulo`,
      detalle: '',
      texto: `ajustes.${tipo}.borrarTexto`,
      confirmar: 'ajustes.borrar',
    });
    if (ok) await this.store.borrar(tipo);
  }
}
