import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { HlmTextarea } from '@brecha/ui/textarea';
import type { ContactoRedDetalle, TipoDeInteraccion } from '../../nucleo/api/api.service';
import { Avisos } from '../../nucleo/avisos';
import { Formato } from '../../nucleo/idioma/idioma';
import { Avatar } from '../../compartido/piezas';
import { DialogoAsociar } from '../bandeja/dialogos';
import { hoyIso } from '../postulacion/dialogos/base';
import { Dialogos } from '../postulacion/dialogos/dialogos.service';
import { TableroStore } from '../tablero/tablero.store';
import { lineaDeContacto } from './dialogos';
import { ConexionRed, PendienteRed, iconoInteraccion } from './piezas';
import { ContactoStore, momentoDe } from './red.store';

const TIPOS: TipoDeInteraccion[] = [
  'mensaje_recibido',
  'mensaje_enviado',
  'conversacion_cerrada',
  'solicitud_enviada',
  'solicitud_recibida',
  'solicitud_aceptada',
  'solicitud_rechazada',
  'solicitud_retirada',
  'nota',
];

const TARJETA =
  'flex flex-col gap-3 rounded-[12px] border border-linea bg-fondo px-5 py-4 shadow-tarjeta';

/** Detalle de alguien de tu red: conversación, notas, seguimiento y postulaciones ligadas. */
@Component({
  selector: 'b-contacto-red',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TranslocoPipe,
    HlmButton,
    HlmInput,
    HlmTextarea,
    Avatar,
    ConexionRed,
    PendienteRed,
  ],
  providers: [ContactoStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full flex-col' },
  template: `
    <div
      class="flex h-12 flex-none items-center gap-2.5 border-b border-linea px-6 text-tinta-suave"
    >
      <a routerLink="/red" class="text-tinta-suave no-underline hover:text-tinta">{{
        'red.titulo' | transloco
      }}</a>
      @if (store.detalle(); as d) {
        <span aria-hidden="true">/</span>
        <span class="font-semibold text-tinta">{{ d.nombre }}</span>
      }
    </div>
    @switch (store.estado()) {
      @case ('cargando') {
        <p class="p-8 text-tinta-suave" aria-busy="true">…</p>
      }
      @case ('error') {
        <div
          role="alert"
          class="m-6 flex items-center gap-3 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
        >
          <span class="flex-1">{{
            (store.error()?.codigo === 'NO_ENCONTRADO'
              ? 'red.detalle.noEncontrado'
              : (store.error()?.clave ?? 'errores.RED')
            ) | transloco
          }}</span>
          <a hlmBtn variant="outline" size="sm" routerLink="/red">{{ 'red.titulo' | transloco }}</a>
        </div>
      }
      @case ('listo') {
        @if (store.detalle(); as d) {
          <div class="flex max-w-5xl flex-col gap-5 px-9 pt-7 pb-10">
            <div class="flex flex-wrap items-center gap-4">
              <b-avatar [empresa]="d.nombre" [tamano]="56" />
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <h1
                  class="m-0 font-titulo text-[26px] leading-tight font-extrabold tracking-[-0.02em]"
                >
                  {{ d.nombre }}
                </h1>
                @if (linea(d); as l) {
                  <span class="text-tinta-suave">{{ l }}</span>
                }
                <span class="flex flex-wrap items-center gap-3">
                  <b-conexion-red [conexion]="d.conexion" />
                  <b-pendiente-red [contacto]="d" />
                  @if (d.pendiente === 'responder' && d.conexion !== 'solicitud_recibida') {
                    <button
                      hlmBtn
                      variant="outline"
                      size="sm"
                      type="button"
                      [disabled]="store.ocupado()"
                      (click)="cerrarConversacion()"
                    >
                      {{ 'red.detalle.cerrarConversacion' | transloco }}
                    </button>
                  }
                </span>
              </div>
              @if (d.perfilUrl) {
                <a
                  hlmBtn
                  variant="outline"
                  [href]="d.perfilUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ 'red.verPerfil' | transloco }} ↗<span class="solo-lector">
                    ({{ 'avisos.nuevaVentana' | transloco }})</span
                  ></a
                >
              } @else {
                <form
                  class="flex items-center gap-1.5"
                  (submit)="completarPerfil(perfil); $event.preventDefault()"
                >
                  <input
                    #perfil
                    hlmInput
                    type="url"
                    class="h-8 w-64 text-[12.5px]"
                    placeholder="linkedin.com/in/…"
                    [attr.aria-label]="'red.agregarPerfil' | transloco"
                  />
                  <button hlmBtn variant="outline" size="sm" type="submit">
                    {{ 'red.agregarPerfil' | transloco }}
                  </button>
                </form>
              }
            </div>

            <div class="grid grid-cols-[minmax(0,1fr)_320px] gap-5">
              <div class="flex min-w-0 flex-col gap-5">
                <section [class]="tarjeta" aria-labelledby="red-registrar">
                  <h2 id="red-registrar" class="m-0 text-base font-extrabold">
                    {{ 'red.detalle.registrar' | transloco }}
                  </h2>
                  <form
                    class="flex flex-col gap-2.5"
                    [formGroup]="interaccion"
                    (ngSubmit)="registrar()"
                    novalidate
                  >
                    <div class="grid grid-cols-[220px_1fr] gap-2.5">
                      <label class="flex flex-col gap-1">
                        <span class="font-semibold">{{ 'red.detalle.tipo' | transloco }}</span>
                        <select
                          formControlName="tipo"
                          class="h-9 rounded-md border border-linea bg-fondo px-2"
                        >
                          @for (t of tipos; track t) {
                            <option [value]="t">{{ 'red.tipos.' + t | transloco }}</option>
                          }
                        </select>
                      </label>
                      <label class="flex flex-col gap-1">
                        <span class="font-semibold">{{ 'red.detalle.fecha' | transloco }}</span>
                        <input
                          hlmInput
                          type="date"
                          class="w-44"
                          [max]="hoy"
                          formControlName="fecha"
                        />
                      </label>
                    </div>
                    <label class="flex flex-col gap-1">
                      <span class="font-semibold">{{ 'red.detalle.resumen' | transloco }}</span>
                      <textarea
                        hlmTextarea
                        rows="2"
                        formControlName="resumen"
                        [placeholder]="'red.detalle.resumenEjemplo' | transloco"
                      ></textarea>
                    </label>
                    <div class="flex justify-end">
                      <button
                        hlmBtn
                        size="sm"
                        type="submit"
                        [disabled]="store.ocupado() || interaccion.invalid"
                      >
                        {{ 'red.detalle.agregar' | transloco }}
                      </button>
                    </div>
                  </form>
                </section>

                <section class="flex flex-col gap-3" aria-labelledby="red-conversacion">
                  <h2 id="red-conversacion" class="m-0 text-base font-extrabold">
                    {{ 'red.detalle.interacciones' | transloco }}
                  </h2>
                  <ol class="m-0 flex list-none flex-col gap-2.5 p-0">
                    @for (i of d.interacciones; track i.id) {
                      <li
                        class="flex items-start gap-3 rounded-[12px] border border-linea bg-fondo px-3.5 py-2.5"
                        [attr.data-interaccion]="i.tipo"
                      >
                        <span
                          class="grid size-[24px] flex-none place-items-center rounded-full text-[12px]"
                          [class]="
                            i.tipo === 'mensaje_recibido'
                              ? 'bg-[#FDE7DC] text-[#8A3A1B]'
                              : 'bg-[var(--plat-linkedin-fondo)] text-[var(--plat-linkedin-tinta)]'
                          "
                          aria-hidden="true"
                          >{{ icono(i.tipo) }}</span
                        >
                        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                          <strong>{{ 'red.tipos.' + i.tipo | transloco }}</strong>
                          <span class="whitespace-pre-line text-[#3C3632]">{{ i.resumen }}</span>
                          <span class="text-xs text-tinta-suave"
                            >{{ formato.fechaHora(i.ocurridaEn) }} ·
                            {{ 'red.origen.' + i.origen | transloco }}</span
                          >
                        </span>
                      </li>
                    } @empty {
                      <li class="text-tinta-suave">{{ 'red.sinInteracciones' | transloco }}</li>
                    }
                  </ol>
                </section>
              </div>

              <div class="flex flex-col gap-4">
                <section [class]="tarjeta" aria-labelledby="red-postulaciones">
                  <h2 id="red-postulaciones" class="m-0 text-base font-extrabold">
                    {{ 'red.detalle.postulaciones' | transloco }}
                  </h2>
                  <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                    @for (p of d.postulacionIds; track p) {
                      <li class="flex items-center gap-2">
                        <a
                          [routerLink]="['/postulaciones', p]"
                          class="min-w-0 flex-1 truncate text-tinta underline-offset-2 hover:underline"
                          >{{ postulacion(p) }}</a
                        >
                        <button
                          hlmBtn
                          variant="ghost"
                          size="xs"
                          type="button"
                          [disabled]="store.ocupado()"
                          [attr.aria-label]="
                            'red.detalle.desvincularDe' | transloco: { postulacion: postulacion(p) }
                          "
                          (click)="desvincular(p)"
                        >
                          {{ 'red.detalle.desvincular' | transloco }}
                        </button>
                      </li>
                    } @empty {
                      <li class="text-tinta-suave">
                        {{ 'red.detalle.sinPostulaciones' | transloco }}
                      </li>
                    }
                  </ul>
                  <div>
                    <button
                      hlmBtn
                      variant="outline"
                      size="sm"
                      type="button"
                      [disabled]="store.ocupado()"
                      (click)="vincular(d)"
                    >
                      + {{ 'red.detalle.vincular' | transloco }}
                    </button>
                  </div>
                </section>

                <section [class]="tarjeta" aria-labelledby="red-seguimiento">
                  <h2 id="red-seguimiento" class="m-0 text-base font-extrabold">
                    {{ 'red.detalle.seguimiento' | transloco }}
                  </h2>
                  <p class="m-0 text-[12.5px] text-tinta-suave">
                    {{ 'red.detalle.seguimientoAyuda' | transloco }}
                  </p>
                  @if (d.seguimientoVencido) {
                    <p class="m-0 font-semibold text-error">
                      {{
                        'red.seguimientoVencido'
                          | transloco: { fecha: formato.fechaCorta(d.seguimiento) }
                      }}
                    </p>
                  }
                  <div class="flex flex-wrap items-end gap-2">
                    <label class="flex flex-col gap-1">
                      <span class="solo-lector">{{ 'red.detalle.seguimiento' | transloco }}</span>
                      <input
                        hlmInput
                        type="date"
                        class="w-44"
                        [value]="seguimiento()"
                        (input)="seguimiento.set($any($event.target).value)"
                      />
                    </label>
                    <button
                      hlmBtn
                      size="sm"
                      type="button"
                      [disabled]="store.ocupado() || (seguimiento() || null) === d.seguimiento"
                      (click)="guardarSeguimiento(seguimiento() || null)"
                    >
                      {{ 'red.detalle.guardar' | transloco }}
                    </button>
                    @if (d.seguimiento) {
                      <button
                        hlmBtn
                        variant="ghost"
                        size="sm"
                        type="button"
                        [disabled]="store.ocupado()"
                        (click)="guardarSeguimiento(null)"
                      >
                        {{ 'red.detalle.quitarSeguimiento' | transloco }}
                      </button>
                    }
                  </div>
                </section>

                <section [class]="tarjeta" aria-labelledby="red-notas">
                  <h2 id="red-notas" class="m-0 text-base font-extrabold">
                    {{ 'red.detalle.notas' | transloco }}
                  </h2>
                  <textarea
                    hlmTextarea
                    aria-labelledby="red-notas"
                    rows="4"
                    [value]="notas()"
                    (input)="notas.set($any($event.target).value)"
                    [placeholder]="'red.detalle.notasEjemplo' | transloco"
                  ></textarea>
                  <div class="flex justify-end">
                    <button
                      hlmBtn
                      size="sm"
                      variant="outline"
                      type="button"
                      [disabled]="store.ocupado() || notas().trim() === (d.notas ?? '')"
                      (click)="guardarNotas()"
                    >
                      {{ 'red.detalle.guardarNotas' | transloco }}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        }
      }
    }
  `,
})
export class ContactoRedPagina {
  readonly id = input.required<string>();
  protected readonly store = inject(ContactoStore);
  protected readonly formato = inject(Formato);
  private readonly tablero = inject(TableroStore);
  private readonly dialogos = inject(Dialogos);
  private readonly avisos = inject(Avisos);
  private readonly t = inject(TranslocoService);
  protected readonly tarjeta = TARJETA;
  protected readonly tipos = TIPOS;
  protected readonly hoy = hoyIso();

  protected readonly notas = signal('');
  protected readonly seguimiento = signal('');
  protected readonly interaccion = new FormGroup({
    tipo: new FormControl<TipoDeInteraccion>('mensaje_recibido', { nonNullable: true }),
    resumen: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    fecha: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    effect(() => void this.store.cargar(this.id()));
    effect(() => {
      const d = this.store.detalle();
      this.notas.set(d?.notas ?? '');
      this.seguimiento.set(d?.seguimiento ?? '');
    });
  }

  protected linea(d: ContactoRedDetalle): string {
    return lineaDeContacto(d);
  }

  protected icono(tipo: string): string {
    return iconoInteraccion(tipo);
  }

  protected postulacion(id: string): string {
    const p = this.tablero.buscar(id);
    return p ? `${p.empresa} · ${p.titulo}` : this.t.translate('red.detalle.postulacion');
  }

  protected async registrar(): Promise<void> {
    if (this.interaccion.invalid) return;
    const v = this.interaccion.getRawValue();
    const ocurridaEn = v.fecha ? momentoDe(v.fecha) : undefined;
    const r = await this.store.interaccion({
      tipo: v.tipo,
      resumen: v.resumen.trim(),
      ...(ocurridaEn ? { ocurridaEn } : {}),
    });
    if (!r.ok) {
      this.avisos.error(r.error);
      return;
    }
    this.interaccion.reset({ tipo: v.tipo, resumen: '', fecha: '' });
    if (r.agregada === false) this.avisos.aviso('red.detalle.repetida');
    else this.avisos.exito('red.detalle.registrada');
  }

  /** La otra persona se despidió y no hace falta contestar: sale de «por responder» hasta que vuelva a escribir. */
  protected async cerrarConversacion(): Promise<void> {
    const r = await this.store.interaccion({
      tipo: 'conversacion_cerrada',
      resumen: this.t.translate('red.detalle.conversacionCerradaResumen'),
    });
    if (r.ok) this.avisos.exito('red.detalle.conversacionCerrada');
    else this.avisos.error(r.error);
  }

  protected async vincular(d: ContactoRedDetalle): Promise<void> {
    const id = await this.dialogos.abrir<string, object>(DialogoAsociar, {
      titulo: 'red.detalle.vincularTitulo',
      resumen: d.nombre,
      empresa: d.empresa ?? '',
    });
    if (!id) return;
    const r = await this.store.vincular(id);
    if (r.ok) this.avisos.exito('red.detalle.vinculada', { postulacion: this.postulacion(id) });
    else this.avisos.error(r.error);
  }

  protected async desvincular(id: string): Promise<void> {
    const nombre = this.postulacion(id);
    const r = await this.store.desvincular(id);
    if (r.ok) this.avisos.exito('red.detalle.desvinculada', { postulacion: nombre });
    else this.avisos.error(r.error);
  }

  protected async guardarSeguimiento(fecha: string | null): Promise<void> {
    const r = await this.store.editar({ seguimiento: fecha });
    if (r.ok) this.avisos.exito('red.detalle.guardado');
    else this.avisos.error(r.error);
  }

  /** Completa el perfil de LinkedIn de un contacto que llegó sin él (por ejemplo, desde un CSV). */
  protected async completarPerfil(campo: HTMLInputElement): Promise<void> {
    const perfilUrl = campo.value.trim();
    if (!perfilUrl) return;
    const r = await this.store.editar({ perfilUrl });
    if (r.ok) {
      campo.value = '';
      this.avisos.exito('red.detalle.guardado');
    } else this.avisos.error(r.error);
  }

  protected async guardarNotas(): Promise<void> {
    const texto = this.notas().trim();
    const r = await this.store.editar({ notas: texto || null });
    if (r.ok) this.avisos.exito('red.detalle.guardado');
    else this.avisos.error(r.error);
  }
}
