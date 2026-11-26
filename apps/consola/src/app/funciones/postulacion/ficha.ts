import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type {
  CambioDeEstado,
  ContactoEntrada,
  Detalle,
  Discrepancia,
  EntrevistaEntrada,
  EstadoPostulacion,
  Senal,
  SenalEntrada,
} from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { HlmTextarea } from '@brecha/ui/textarea';
import { Api, type ContactoRed, type ContactoRedEntrada } from '../../nucleo/api/api.service';
import { Avisos } from '../../nucleo/avisos';
import { Formato } from '../../nucleo/idioma/idioma';
import {
  Avatar,
  EtiquetaPlataforma,
  herramientasPedidas,
  ListaStack,
  PuntoPrioridad,
} from '../../compartido/piezas';
import { CitaAviso, InsigniaCalce } from '../avisos/piezas';
import {
  DialogoElegirContacto,
  DialogoNuevoContacto,
  lineaDeContacto,
  type Eleccion,
} from '../red/dialogos';
import { ConexionRed, PendienteRed } from '../red/piezas';
import { RedStore } from '../red/red.store';
import { DialogoContacto } from './dialogos/contacto';
import { Dialogos } from './dialogos/dialogos.service';
import { DialogoEntrevista } from './dialogos/entrevista';
import { DialogoSenal } from './dialogos/senal';
import { FichaStore, type InteraccionDeContacto } from './ficha.store';
import { Proceso } from './proceso';
import { Transiciones } from './transiciones';

const EMBUDO: EstadoPostulacion[] = [
  'sin_decidir',
  'por_postular',
  'postulado',
  'en_proceso',
  'entrevista',
  'oferta',
  'aceptada',
];
const AVANCE: EstadoPostulacion[] = ['postulado', 'en_proceso', 'entrevista', 'oferta', 'aceptada'];

type Elemento =
  | { tipo: 'cambio'; fecha: string; c: CambioDeEstado }
  | { tipo: 'senal'; fecha: string; s: Senal }
  | { tipo: 'linkedin'; fecha: string; m: InteraccionDeContacto }
  | { tipo: 'nota'; fecha: string; texto: string }
  | { tipo: 'entrevista'; fecha: string; texto: string };

interface Etapa {
  estado: EstadoPostulacion;
  modo: 'hecha' | 'actual' | 'pendiente';
  fecha: string | null;
  detalle: string;
}

/** Ficha de postulación (ui.md §4.4, maqueta «Ficha · Cálida terracota»). */
@Component({
  selector: 'b-ficha',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TranslocoPipe,
    HlmButton,
    HlmInput,
    HlmTextarea,
    Avatar,
    EtiquetaPlataforma,
    PuntoPrioridad,
    ListaStack,
    InsigniaCalce,
    CitaAviso,
    PendienteRed,
    ConexionRed,
    Proceso,
  ],
  providers: [FichaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full flex-col' },
  template: `
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
              ? 'ficha.noEncontrada'
              : (store.error()?.clave ?? 'errores.RED')
            ) | transloco
          }}</span>
          <a hlmBtn variant="outline" size="sm" routerLink="/tablero">{{
            'ficha.volver' | transloco
          }}</a>
        </div>
      }
      @case ('listo') {
        @if (store.detalle(); as d) {
          <div
            class="flex h-12 flex-none items-center gap-2.5 border-b border-linea px-6 text-tinta-suave"
          >
            <a routerLink="/tablero" class="text-tinta-suave no-underline hover:text-tinta">{{
              'ficha.volver' | transloco
            }}</a>
            <span aria-hidden="true">/</span>
            <span>{{ 'estados.' + d.estado | transloco }}</span>
            <span aria-hidden="true">/</span>
            <span class="font-semibold text-tinta">{{ d.empresa }}</span>
          </div>

          <div class="flex min-h-0 flex-1">
            <main class="flex max-w-[820px] min-w-0 flex-1 flex-col gap-5 px-9 pt-7 pb-10">
              <div class="flex items-center gap-4">
                <b-avatar [empresa]="d.empresa" [tamano]="64" />
                <div class="flex flex-col gap-[3px]">
                  <h1
                    class="m-0 font-titulo text-[28px] leading-tight font-extrabold tracking-[-0.02em]"
                  >
                    {{ d.titulo }}
                  </h1>
                  <span class="flex flex-wrap items-center gap-3 text-tinta-suave">
                    <span class="font-semibold text-tinta">{{ d.empresa }}</span>
                    <b-plataforma [plataforma]="d.plataforma" />
                    <b-prioridad [prioridad]="d.prioridad" />
                    <span>{{ 'estados.' + d.estado | transloco }}</span>
                  </span>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                @for (a of d.transicionesPosibles; track a; let primero = $first) {
                  <button
                    hlmBtn
                    type="button"
                    [variant]="primero && esAvance(a) ? 'default' : 'outline'"
                    [disabled]="store.ocupado()"
                    (click)="mover(a)"
                    [attr.data-transicion]="a"
                  >
                    {{ 'ficha.pasarA' | transloco: { estado: ('estados.' + a | transloco) } }}
                  </button>
                }
                @if (puedeAgendar()) {
                  <button hlmBtn variant="outline" type="button" (click)="agendar()">
                    {{ 'ficha.agendar' | transloco }}
                  </button>
                }
              </div>

              @for (x of store.discrepanciasAbiertas(); track x.id) {
                <section
                  [attr.aria-label]="'ficha.discrepanciaTitulo' | transloco"
                  class="flex flex-wrap items-center gap-3 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3"
                  role="alert"
                >
                  <span aria-hidden="true" class="text-aviso-tinta">⚠</span>
                  <span class="min-w-60 flex-1 text-[#5C3E00]"
                    ><strong>{{ 'ficha.discrepanciaTitulo' | transloco }}</strong>
                    {{ textoDiscrepancia(x, d) }}</span
                  >
                  <button
                    hlmBtn
                    variant="outline"
                    size="sm"
                    type="button"
                    (click)="resolver(x, 'confirmar')"
                  >
                    {{ 'ficha.mantener' | transloco }}
                  </button>
                  <button
                    hlmBtn
                    size="sm"
                    type="button"
                    class="bg-aviso-tinta hover:bg-aviso-tinta/90"
                    (click)="resolver(x, 'corregir')"
                  >
                    {{ 'ficha.corregir' | transloco }}
                  </button>
                </section>
              }

              <b-proceso [detalle]="d" />

              @if (d.perfil; as pf) {
                @if (pf.choques.length || pf.sinDato.length) {
                  <section
                    aria-labelledby="ficha-perfil"
                    class="flex flex-col gap-2 rounded-[14px] border px-4 py-3.5"
                    [class.border-aviso-borde]="!pf.cumpleDuras"
                    [class.bg-aviso-fondo]="!pf.cumpleDuras"
                    [class.border-linea]="pf.cumpleDuras"
                    data-perfil-ficha
                  >
                    <h2
                      id="ficha-perfil"
                      class="m-0 flex items-center gap-2 font-sans text-sm font-bold"
                    >
                      {{ 'perfil.tuPerfil' | transloco }}
                      <a routerLink="/perfil" class="ml-auto text-[12.5px] font-semibold">{{
                        'perfil.verPerfil' | transloco
                      }}</a>
                    </h2>
                    <ul class="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                      @for (c of pf.choques; track c.reglaId) {
                        <li>
                          <strong
                            >{{ c.dura ? ('perfil.dura' | transloco) : 'P' + c.prioridad }} ·
                            {{ c.texto }}</strong
                          >
                          <span class="block text-tinta-suave">{{ c.regla }}</span>
                        </li>
                      }
                      @for (x of pf.sinDato; track x.reglaId) {
                        <li class="text-tinta-suave">
                          {{ 'perfil.noSePudo' | transloco }} · {{ x.texto }}
                        </li>
                      }
                    </ul>
                    @if (!pf.cumpleDuras) {
                      <p class="m-0 text-[12.5px] text-tinta-suave">
                        {{ 'perfil.fichaAyuda' | transloco }}
                      </p>
                    }
                  </section>
                }
              }

              <section
                aria-labelledby="ficha-resumen"
                class="flex flex-col gap-3 rounded-[14px] border border-linea bg-fondo px-4 py-3.5 shadow-tarjeta"
                data-resumen
              >
                <h2 id="ficha-resumen" class="m-0 flex items-center font-sans text-sm font-bold">
                  <span class="flex-1">{{ 'ficha.deUnVistazo' | transloco }}</span>
                  @if (!editando()) {
                    <button
                      hlmBtn
                      variant="ghost"
                      size="xs"
                      type="button"
                      (click)="empezarEdicion(d)"
                    >
                      {{ 'ficha.editar' | transloco }}
                    </button>
                  }
                </h2>
                @if (editando()) {
                  <form
                    [formGroup]="edicion"
                    (ngSubmit)="guardarEdicion(d)"
                    class="flex flex-col gap-2 rounded-[10px] border border-linea px-3 py-2.5"
                  >
                    <label class="flex flex-col gap-1 text-[12.5px]"
                      >{{ 'ficha.canal' | transloco }}
                      <span class="flex gap-2">
                        <select
                          formControlName="canalTipo"
                          class="h-9 rounded-md border border-linea bg-fondo px-2"
                        >
                          @for (c of canales; track c) {
                            <option [value]="c">{{ 'canales.' + c | transloco }}</option>
                          }
                        </select>
                        <input hlmInput class="flex-1" formControlName="canalValor" />
                      </span>
                    </label>
                    <label class="flex flex-col gap-1 text-[12.5px]"
                      >{{ 'ficha.sueldo' | transloco }}
                      <span class="flex gap-2">
                        <input
                          hlmInput
                          type="number"
                          min="0"
                          class="flex-1"
                          formControlName="monto"
                        />
                        <select
                          formControlName="moneda"
                          class="h-9 rounded-md border border-linea bg-fondo px-2"
                        >
                          <option value="CLP">CLP</option>
                          <option value="USD">USD</option>
                        </select>
                      </span>
                    </label>
                    <label class="flex flex-col gap-1 text-[12.5px]"
                      >{{ 'nueva.cierre' | transloco }}
                      <input hlmInput type="date" formControlName="cierre" />
                    </label>
                    <div class="flex justify-end gap-2">
                      <button
                        hlmBtn
                        variant="outline"
                        size="sm"
                        type="button"
                        (click)="editando.set(false)"
                      >
                        {{ 'ficha.cancelar' | transloco }}
                      </button>
                      <button hlmBtn size="sm" type="submit">
                        {{ 'ficha.guardar' | transloco }}
                      </button>
                    </div>
                  </form>
                } @else {
                  <dl
                    class="m-0 grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1.5 2xl:grid-cols-[130px_minmax(0,1fr)_130px_minmax(0,1fr)]"
                  >
                    <dt class="text-tinta-suave">{{ 'ficha.comoPostulaste' | transloco }}</dt>
                    <dd class="m-0 font-semibold">
                      {{
                        d.canal
                          ? ('canales.' + d.canal.tipo | transloco) + ' · ' + d.canal.valor
                          : ('ficha.sinPostular' | transloco)
                      }}
                    </dd>
                    <dt class="text-tinta-suave">{{ 'ficha.fechaPostulacion' | transloco }}</dt>
                    <dd class="m-0">
                      {{
                        d.fechaPostulacion
                          ? formato.fechaCorta(d.fechaPostulacion)
                          : ('ficha.sinDato' | transloco)
                      }}
                    </dd>
                    <dt class="text-tinta-suave">{{ 'ficha.aviso' | transloco }}</dt>
                    <dd class="m-0">
                      <a
                        [href]="d.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="font-semibold text-acento underline-offset-2 hover:underline"
                        >{{
                          'ficha.abrirAviso'
                            | transloco: { plataforma: ('plataformas.' + d.plataforma | transloco) }
                        }}
                        ↗<span class="solo-lector">
                          ({{ 'avisos.nuevaVentana' | transloco }})</span
                        ></a
                      >
                    </dd>
                    <dt class="text-tinta-suave">{{ 'nueva.plataforma' | transloco }}</dt>
                    <dd class="m-0"><b-plataforma [plataforma]="d.plataforma" /></dd>
                    <dt class="text-tinta-suave">{{ 'nueva.modalidad' | transloco }}</dt>
                    <dd class="m-0">{{ 'modalidades.' + d.aviso.modalidad | transloco }}</dd>
                    <dt class="text-tinta-suave">{{ 'nueva.ubicacion' | transloco }}</dt>
                    <dd class="m-0">{{ d.aviso.ubicacion || ('ficha.sinDato' | transloco) }}</dd>
                    <dt class="text-tinta-suave">{{ 'ficha.cierre' | transloco }}</dt>
                    <dd
                      class="m-0"
                      [class.text-error]="d.diasAlCierre !== null && d.diasAlCierre < 0"
                    >
                      {{
                        d.cierre
                          ? ('ficha.cierra' | transloco: { fecha: formato.fechaCorta(d.cierre) })
                          : ('ficha.sinCierre' | transloco)
                      }}
                    </dd>
                    <dt class="text-tinta-suave">{{ 'ficha.sueldo' | transloco }}</dt>
                    <dd class="m-0">
                      {{
                        d.sueldoPretendido
                          ? formato.monto(d.sueldoPretendido.monto, d.sueldoPretendido.moneda)
                          : ('ficha.sinDato' | transloco)
                      }}
                    </dd>
                    @if (!store.avisoIa() && d.aviso.sueldoPublicado) {
                      <dt class="text-tinta-suave">{{ 'ficha.sueldoPublicado' | transloco }}</dt>
                      <dd class="m-0">{{ d.aviso.sueldoPublicado }}</dd>
                    }
                    @if (store.avisoIa(); as a) {
                      <dt class="text-tinta-suave">{{ 'ficha.sueldoPublicado' | transloco }}</dt>
                      <dd class="m-0">
                        {{
                          a.sueldo ||
                            d.aviso.sueldoPublicado ||
                            ('ficha.sueldoNoPublicado' | transloco)
                        }}
                      </dd>
                      <dt class="text-tinta-suave">{{ 'ficha.calce' | transloco }}</dt>
                      <dd class="m-0"><b-calce [calce]="a.calce" [analizado]="a.analizado" /></dd>
                    }
                  </dl>
                  @switch (store.estadoAvisoIa()) {
                    @case ('listo') {
                      @if (store.avisoIa(); as a) {
                        <div
                          class="flex flex-col gap-1.5 border-t border-linea pt-2.5"
                          data-analisis
                        >
                          <p class="m-0 text-[12.5px]">
                            <span class="font-semibold text-aviso-tinta"
                              >{{ 'avisos.brechas' | transloco }}:</span
                            >
                            {{
                              a.brechas.length
                                ? a.brechas.join(', ')
                                : ('avisos.sinBrechas' | transloco)
                            }}
                          </p>
                          <b-cita [aviso]="a" />
                        </div>
                      }
                    }
                    @case ('apagada') {
                      <p
                        class="m-0 border-t border-linea pt-2.5 text-[12.5px] text-tinta-suave"
                        data-analisis
                      >
                        {{ 'ficha.analisisApagado' | transloco }}
                      </p>
                    }
                    @case ('error') {
                      <p
                        class="m-0 border-t border-linea pt-2.5 text-[12.5px] text-tinta-suave"
                        data-analisis
                      >
                        {{ 'ficha.analisisError' | transloco }}
                      </p>
                    }
                    @case ('sin_aviso') {
                      <p class="m-0 border-t border-linea pt-2.5 text-[12.5px] text-tinta-suave">
                        {{ 'ficha.sinAnalisis' | transloco }}
                      </p>
                    }
                  }
                }
              </section>

              <section
                aria-labelledby="ficha-stack"
                class="flex flex-col gap-3 rounded-[14px] border border-linea bg-fondo px-4 py-3.5 shadow-tarjeta"
                data-stack
              >
                <h2 id="ficha-stack" class="m-0 font-sans text-sm font-bold">
                  {{ 'stack.titulo' | transloco }}
                </h2>
                @if (herramientas().length) {
                  <b-stack [herramientas]="herramientas()" />
                  @if (explicacionStack(); as clave) {
                    <p class="m-0 text-[12.5px] text-tinta-suave">{{ clave | transloco }}</p>
                  }
                } @else {
                  <p class="m-0 text-[12.5px] text-tinta-suave">
                    {{ 'stack.sinStack' | transloco }}
                  </p>
                }
                @if (d.aviso.requisitos) {
                  <p class="m-0 text-[12.5px] whitespace-pre-line">
                    <span class="font-semibold">{{ 'stack.requisitos' | transloco }}:</span>
                    {{ d.aviso.requisitos }}
                  </p>
                }

                <div class="flex flex-col gap-1.5 border-t border-linea pt-2.5" data-etiquetas>
                  <span class="text-[12.5px] font-semibold text-tinta-suave">{{
                    'etiquetas.titulo' | transloco
                  }}</span>
                  <div class="flex flex-wrap items-center gap-1.5">
                    @for (e of d.etiquetas; track e) {
                      <span
                        class="inline-flex items-center gap-1 rounded-full border border-linea bg-superficie py-[1px] pr-1 pl-2 text-[12.5px]"
                        >#{{ e }}
                        <button
                          type="button"
                          class="grid size-5 place-items-center rounded-full text-tinta-suave hover:bg-linea"
                          [attr.aria-label]="'etiquetas.quitar' | transloco: { etiqueta: e }"
                          (click)="quitarEtiqueta(e)"
                        >
                          ✕
                        </button></span
                      >
                    }
                    <input
                      hlmInput
                      class="h-7 w-40 text-[12.5px]"
                      data-nueva-etiqueta
                      [attr.aria-label]="'etiquetas.agregar' | transloco"
                      [placeholder]="'etiquetas.agregar' | transloco"
                      (keydown.enter)="
                        agregarEtiqueta($any($event.target)); $event.preventDefault()
                      "
                    />
                  </div>
                </div>

                <label class="flex items-center gap-2 text-[12.5px]">
                  <span class="font-semibold text-tinta-suave">{{
                    'ficha.prioridad' | transloco
                  }}</span>
                  <select
                    data-prioridad
                    class="h-8 rounded-md border border-linea bg-fondo px-2"
                    (change)="fijarPrioridad($any($event.target).value)"
                  >
                    <option value="" [selected]="!d.prioridadFijada">
                      {{
                        'ficha.prioridadAutomatica'
                          | transloco: { p: ('prioridad.' + d.prioridad | transloco) }
                      }}
                    </option>
                    @for (p of ['alta', 'media', 'baja']; track p) {
                      <option [value]="p" [selected]="d.prioridadFijada === p">
                        {{ 'prioridad.' + p | transloco }}
                      </option>
                    }
                  </select>
                </label>
              </section>

              <section
                [attr.aria-label]="'ficha.etapas' | transloco"
                class="rounded-[14px] border border-[#ECE7DF] bg-superficie p-1.5"
              >
                @for (e of etapas(); track e.estado) {
                  <div
                    class="flex items-center gap-3 rounded-[10px] border px-3 py-[11px]"
                    [class.border-transparent]="e.modo !== 'actual'"
                    [class.border-acento]="e.modo === 'actual'"
                    [class.bg-fondo]="e.modo === 'actual'"
                    [class.text-tinta-suave]="e.modo === 'pendiente'"
                  >
                    <span
                      class="grid size-5 flex-none place-items-center rounded-full text-[11px] text-white"
                      [class.bg-ok]="e.modo === 'hecha'"
                      [class.bg-acento]="e.modo === 'actual'"
                      [class.border-dashed]="e.modo === 'pendiente'"
                      [class.border-[1.5px]]="e.modo === 'pendiente'"
                      [class.border-[#BDB5AB]]="e.modo === 'pendiente'"
                      aria-hidden="true"
                      >{{ e.modo === 'hecha' ? '✓' : '' }}</span
                    >
                    <span class="min-w-[120px] font-semibold">{{
                      'estados.' + e.estado | transloco
                    }}</span>
                    <span class="solo-lector">{{
                      (e.modo === 'hecha'
                        ? 'ficha.etapaHecha'
                        : e.modo === 'actual'
                          ? 'ficha.etapaActual'
                          : 'ficha.etapaPendiente'
                      ) | transloco
                    }}</span>
                    <span class="flex-1 text-tinta-suave">{{ e.detalle }}</span>
                    <span class="text-tinta-suave tabular-nums">{{
                      formato.fechaCorta(e.fecha)
                    }}</span>
                  </div>
                }
              </section>

              <section class="flex flex-col gap-2" aria-labelledby="ficha-con-quien" data-con-quien>
                <h2 id="ficha-con-quien" class="m-0 font-sans text-sm font-bold">
                  {{ 'ficha.conQuienHablas' | transloco }}
                </h2>
                @if (store.errorRed(); as e) {
                  <p class="m-0 text-[12.5px] text-aviso-tinta" role="status">
                    {{ 'ficha.redNoDisponible' | transloco }}
                  </p>
                }
                <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                  @for (c of store.red(); track c.id) {
                    <li
                      class="flex flex-wrap items-center gap-3 rounded-[10px] border border-linea px-3 py-2"
                      [attr.data-contacto-red]="c.id"
                    >
                      <b-avatar [empresa]="c.nombre" [tamano]="28" />
                      <span class="flex min-w-0 flex-1 flex-col gap-px">
                        <a
                          [routerLink]="['/red', c.id]"
                          class="font-semibold text-tinta underline-offset-2 hover:underline"
                          >{{ c.nombre }}</a
                        >
                        <span class="truncate text-[12.5px] text-tinta-suave"
                          >{{ 'plataformas.linkedin' | transloco
                          }}{{ lineaRed(c) ? ' · ' + lineaRed(c) : '' }}</span
                        >
                        @if (c.ultimaInteraccion; as u) {
                          <span class="truncate text-[12.5px] text-[#3C3632]"
                            >{{ 'red.tipos.' + u.tipo | transloco }}: {{ u.resumen }} ·
                            {{ formato.fechaCorta(u.ocurridaEn) }}</span
                          >
                        }
                      </span>
                      <b-pendiente-red [contacto]="c" />
                      <b-conexion-red [conexion]="c.conexion" />
                      @if (c.perfilUrl) {
                        <a
                          [href]="c.perfilUrl"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-[12.5px] font-semibold text-acento underline-offset-2 hover:underline"
                          >{{ 'red.verPerfil' | transloco
                          }}<span class="solo-lector">
                            ({{ c.nombre }}, {{ 'avisos.nuevaVentana' | transloco }})</span
                          ></a
                        >
                      } @else {
                        <span class="text-[12.5px] text-tinta-suave">{{
                          'red.sinPerfil' | transloco
                        }}</span>
                      }
                    </li>
                  }
                  @for (c of d.contactos; track c.id) {
                    <li
                      class="flex flex-wrap items-center gap-3 rounded-[10px] border border-linea px-3 py-2"
                    >
                      <b-avatar [empresa]="c.nombre" [tamano]="28" />
                      <span class="flex min-w-0 flex-1 flex-col gap-px">
                        <span class="font-semibold">{{ c.nombre }}</span>
                        @if (c.rol) {
                          <span class="truncate text-[12.5px] text-tinta-suave">{{ c.rol }}</span>
                        }
                      </span>
                      @if (c.email) {
                        <a [href]="'mailto:' + c.email" class="text-[12.5px] text-acento">{{
                          c.email
                        }}</a>
                      }
                      @if (c.linkedin) {
                        <a
                          [href]="enlace(c.linkedin)"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-[12.5px] font-semibold text-acento underline-offset-2 hover:underline"
                          >{{ 'red.verPerfil' | transloco
                          }}<span class="solo-lector">
                            ({{ c.nombre }}, {{ 'avisos.nuevaVentana' | transloco }})</span
                          ></a
                        >
                      }
                    </li>
                  }
                  @if (!store.red().length && !d.contactos.length) {
                    <li class="text-tinta-suave">{{ 'ficha.nadieTodavia' | transloco }}</li>
                  }
                </ul>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="h-[34px] rounded-full border border-dashed border-[#D8D1C6] px-3 text-tinta-suave hover:text-tinta"
                    (click)="ligarRed()"
                  >
                    + {{ 'ficha.ligarRed' | transloco }}
                  </button>
                  <button
                    type="button"
                    class="h-[34px] rounded-full border border-dashed border-[#D8D1C6] px-3 text-tinta-suave hover:text-tinta"
                    (click)="agregarContacto()"
                  >
                    + {{ 'ficha.agregarContacto' | transloco }}
                  </button>
                </div>
              </section>

              <section class="flex flex-col gap-2">
                <h2 class="m-0 font-sans text-sm font-bold">
                  {{ 'ficha.entrevistas' | transloco }}
                </h2>
                @for (e of d.entrevistas; track e.id) {
                  <div class="flex items-center gap-3 rounded-[10px] border border-linea px-3 py-2">
                    <span class="font-semibold">{{ 'entrevistas.' + e.tipo | transloco }}</span>
                    <span class="flex-1 text-tinta-suave"
                      >{{ formato.fechaHora(e.fecha) }}
                      @if (e.con) {
                        · {{ e.con }}
                      }
                    </span>
                    <label class="flex items-center gap-2 text-[12.5px] text-tinta-suave"
                      >{{ 'ficha.resultado' | transloco }}
                      <select
                        class="h-8 rounded-md border border-linea bg-fondo px-2 text-tinta"
                        [value]="e.resultado"
                        (change)="resultado(e.id, $any($event.target).value)"
                      >
                        @for (r of resultados; track r) {
                          <option [value]="r">{{ 'resultados.' + r | transloco }}</option>
                        }
                      </select>
                    </label>
                  </div>
                } @empty {
                  <p class="m-0 text-tinta-suave">{{ 'ficha.sinEntrevistas' | transloco }}</p>
                }
              </section>
            </main>

            <aside
              [attr.aria-label]="'ficha.actividad' | transloco"
              class="flex w-[380px] flex-none flex-col border-l border-linea bg-superficie-panel"
            >
              <div role="tablist" class="flex gap-1 border-b border-linea px-3.5 py-3">
                @for (p of pestanas; track p) {
                  <button
                    role="tab"
                    type="button"
                    [attr.aria-selected]="pestana() === p"
                    class="h-8 flex-1 rounded-lg"
                    [class.border]="pestana() === p"
                    [class.border-linea]="pestana() === p"
                    [class.bg-fondo]="pestana() === p"
                    [class.font-semibold]="pestana() === p"
                    [class.text-tinta-suave]="pestana() !== p"
                    (click)="pestana.set(p)"
                  >
                    {{ 'ficha.' + p | transloco }}
                    @if (p === 'senales' && d.senalesNuevas) {
                      {{ d.senalesNuevas }}
                    }
                  </button>
                }
              </div>
              <div class="flex flex-col gap-3.5 overflow-y-auto p-3.5">
                <form
                  id="nota"
                  class="flex flex-col gap-2 rounded-[12px] border border-linea bg-fondo px-3 py-2.5"
                  [formGroup]="notaForm"
                  (ngSubmit)="agregarNota()"
                >
                  <label for="nota-texto" class="solo-lector">{{ 'ficha.nota' | transloco }}</label>
                  <textarea
                    hlmTextarea
                    id="nota-texto"
                    rows="2"
                    class="border-0 shadow-none focus-visible:ring-0"
                    [placeholder]="'ficha.escribirNota' | transloco"
                    formControlName="texto"
                  ></textarea>
                  <div class="flex justify-between">
                    <button
                      hlmBtn
                      variant="ghost"
                      size="sm"
                      type="button"
                      (click)="registrarSenal()"
                    >
                      + {{ 'ficha.registrarSenal' | transloco }}
                    </button>
                    <button
                      hlmBtn
                      size="sm"
                      type="submit"
                      [disabled]="!notaForm.value.texto?.trim()"
                    >
                      {{ 'ficha.agregar' | transloco }}
                    </button>
                  </div>
                </form>

                @for (x of lineaDeTiempo(); track $index) {
                  @if (x.dia) {
                    <p class="m-0 text-xs font-semibold text-tinta-suave">{{ x.dia }}</p>
                  }
                  @switch (x.e.tipo) {
                    @case ('cambio') {
                      @let c = $any(x.e).c;
                      <div class="flex items-start gap-2.5">
                        <span
                          class="grid size-[22px] flex-none place-items-center rounded-full bg-tinta text-[11px] text-white"
                          aria-hidden="true"
                          >→</span
                        >
                        <span>
                          @if (c.de) {
                            {{
                              'ficha.movida'
                                | transloco
                                  : {
                                      de: ('estados.' + c.de | transloco),
                                      a: ('estados.' + c.a | transloco),
                                      origen: ('origenes.' + c.origen | transloco),
                                    }
                            }}
                          } @else {
                            {{
                              'ficha.creada'
                                | transloco
                                  : {
                                      a: ('estados.' + c.a | transloco),
                                      origen: ('origenes.' + c.origen | transloco),
                                    }
                            }}
                          }
                          @if (c.motivo) {
                            <br /><span class="text-xs text-tinta-suave">{{
                              'ficha.motivo' | transloco: { motivo: c.motivo }
                            }}</span>
                          }
                          <br /><span class="text-xs text-tinta-suave">{{
                            formato.fechaHora(c.ocurridoEn)
                          }}</span>
                        </span>
                      </div>
                    }
                    @case ('senal') {
                      @let s = $any(x.e).s;
                      <div
                        class="flex flex-col gap-2 rounded-[12px] border bg-fondo p-3"
                        [class.border-aviso-borde]="!s.aplicada && s.estadoSugerido"
                        [class.border-linea]="s.aplicada || !s.estadoSugerido"
                        [attr.data-senal]="s.id"
                      >
                        <span
                          class="flex flex-wrap items-center gap-2"
                          [attr.data-fuente]="s.fuente"
                        >
                          <span
                            class="grid size-[22px] place-items-center rounded-full text-[11px]"
                            [class]="claseFuente(s.fuente)"
                            aria-hidden="true"
                            >{{ iconoFuente(s.fuente) }}</span
                          >
                          <strong
                            ><span class="solo-lector">{{ 'ficha.origen' | transloco }}: </span
                            >{{ 'fuentes.' + s.fuente | transloco }}</strong
                          >
                          <b-plataforma [plataforma]="s.plataforma" />
                          @if (s.estadoSugerido) {
                            <span
                              class="ml-auto rounded-full bg-[#FDE7E2] px-2 py-px text-[11.5px] font-semibold text-[#A33A1F]"
                              >{{
                                'ficha.sugiere'
                                  | transloco
                                    : { estado: ('estados.' + s.estadoSugerido | transloco) }
                              }}</span
                            >
                          }
                        </span>
                        <span class="text-[#3C3632]">{{ s.resumen }}</span>
                        @if (s.remitente || s.asunto) {
                          <span class="text-xs text-tinta-suave" data-remitente
                            >{{ s.remitente }}{{ s.remitente && s.asunto ? ' · ' : ''
                            }}{{ s.asunto ? '«' + s.asunto + '»' : '' }}</span
                          >
                        }
                        <span class="flex items-center gap-2">
                          <span class="text-xs text-tinta-suave"
                            >{{ formato.fechaHora(s.recibidaEn) }} ·
                            {{
                              'ficha.confianza'
                                | transloco: { valor: formato.porcentaje(s.confianza) }
                            }}</span
                          >
                          @if (s.aplicada) {
                            <span class="ml-auto text-xs font-semibold text-ok">{{
                              'ficha.aplicada' | transloco
                            }}</span>
                          } @else if (s.estadoSugerido) {
                            <button
                              hlmBtn
                              variant="outline"
                              size="xs"
                              class="ml-auto"
                              type="button"
                              (click)="aplicar(s)"
                            >
                              {{ 'ficha.aplicar' | transloco }}
                            </button>
                          }
                        </span>
                      </div>
                    }
                    @case ('linkedin') {
                      @let m = $any(x.e).m;
                      <div
                        class="flex flex-col gap-1.5 rounded-[12px] border border-linea bg-fondo p-3"
                        data-linkedin
                      >
                        <span class="flex flex-wrap items-center gap-2">
                          <span
                            class="grid size-[22px] place-items-center rounded-full bg-[var(--plat-linkedin-fondo)] text-[11px] font-bold text-[var(--plat-linkedin-tinta)]"
                            aria-hidden="true"
                            >in</span
                          >
                          <strong
                            ><span class="solo-lector">{{ 'ficha.origen' | transloco }}: </span
                            >{{ 'plataformas.linkedin' | transloco }}</strong
                          >
                          <span class="text-tinta-suave">{{
                            'red.tipos.' + m.i.tipo | transloco
                          }}</span>
                        </span>
                        <span class="whitespace-pre-line text-[#3C3632]">{{ m.i.resumen }}</span>
                        <span class="text-xs text-tinta-suave"
                          >{{ formato.fechaHora(m.i.ocurridaEn) }} ·
                          <a
                            [routerLink]="['/red', m.contacto.id]"
                            class="text-tinta-suave underline underline-offset-2 hover:text-tinta"
                            >{{ m.contacto.nombre }}</a
                          ></span
                        >
                      </div>
                    }
                    @case ('nota') {
                      <div
                        class="flex flex-col gap-1 rounded-[12px] border border-linea bg-fondo p-3"
                      >
                        <strong>{{ 'ficha.nota' | transloco }}</strong>
                        <span class="whitespace-pre-line text-[#3C3632]">{{
                          $any(x.e).texto
                        }}</span>
                      </div>
                    }
                    @case ('entrevista') {
                      <div class="flex items-start gap-2.5">
                        <span
                          class="grid size-[22px] flex-none place-items-center rounded-full bg-acento text-[11px] text-white"
                          aria-hidden="true"
                          >◷</span
                        >
                        <span>{{ $any(x.e).texto }}</span>
                      </div>
                    }
                  }
                }
              </div>
            </aside>
          </div>
        }
      }
    }
  `,
})
export class FichaPagina {
  readonly id = input.required<string>();
  protected readonly store = inject(FichaStore);
  protected readonly formato = inject(Formato);
  private readonly api = inject(Api);
  private readonly avisos = inject(Avisos);
  private readonly dialogos = inject(Dialogos);
  private readonly transiciones = inject(Transiciones);
  private readonly t = inject(TranslocoService);
  private readonly redStore = inject(RedStore);

  protected readonly pestanas = ['actividad', 'senales', 'notas'] as const;
  protected readonly pestana = signal<(typeof this.pestanas)[number]>('actividad');
  protected readonly canales = ['portal', 'email', 'formulario', 'referido'] as const;
  protected readonly resultados = ['pendiente', 'avanza', 'no_avanza', 'cancelada'] as const;
  protected readonly notaForm = new FormGroup({
    texto: new FormControl('', { nonNullable: true }),
  });
  protected readonly editando = signal(false);
  protected readonly edicion = new FormGroup({
    canalTipo: new FormControl<'portal' | 'email' | 'formulario' | 'referido'>('portal', {
      nonNullable: true,
    }),
    canalValor: new FormControl('', { nonNullable: true }),
    monto: new FormControl<number | null>(null),
    moneda: new FormControl<'CLP' | 'USD'>('CLP', { nonNullable: true }),
    cierre: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    effect(() => void this.store.cargar(this.id()));
  }

  /** Herramientas del aviso con lo que te falta (csv.md §7); sin análisis, el stack del núcleo sin colores. */
  protected readonly herramientas = computed(() => {
    const a = this.store.avisoIa();
    return herramientasPedidas(
      a,
      this.store.detalle()?.aviso.stack ?? [],
      a?.calce !== null && a !== null,
    );
  });

  /** Por qué no hay colores todavía, si no los hay. */
  protected readonly explicacionStack = computed(() => {
    if (!this.herramientas().length || this.herramientas().some((h) => h.estado !== 'sin_dato'))
      return null;
    const a = this.store.avisoIa();
    if (this.store.estadoAvisoIa() === 'apagada') return 'stack.iaApagada';
    if (a?.analizado && a.calce === null) return 'stack.sinPerfil';
    return 'stack.porAnalizar';
  });

  private async editarEtiquetas(etiquetas: string[]): Promise<void> {
    await this.intentar(() =>
      this.store.ejecutar((p) => this.api.editar(p.id, { version: p.version, etiquetas })),
    );
  }

  protected async agregarEtiqueta(campo: HTMLInputElement): Promise<void> {
    const nueva = campo.value.trim();
    const d = this.store.detalle();
    if (!nueva || !d) return;
    campo.value = '';
    await this.editarEtiquetas([...d.etiquetas, nueva]);
  }

  protected async quitarEtiqueta(e: string): Promise<void> {
    const d = this.store.detalle();
    if (d) await this.editarEtiquetas(d.etiquetas.filter((x) => x !== e));
  }

  protected async fijarPrioridad(valor: string): Promise<void> {
    const prioridad = valor === 'alta' || valor === 'media' || valor === 'baja' ? valor : null;
    await this.intentar(() =>
      this.store.ejecutar((p) => this.api.editar(p.id, { version: p.version, prioridad })),
    );
  }

  protected readonly puedeAgendar = computed(() =>
    ['postulado', 'en_proceso', 'entrevista'].includes(this.store.detalle()?.estado ?? ''),
  );

  protected esAvance(e: EstadoPostulacion): boolean {
    return AVANCE.includes(e);
  }

  /** Etapas apiladas: las recorridas, la actual y la siguiente de avance (maqueta de la ficha). */
  protected readonly etapas = computed<Etapa[]>(() => {
    const d = this.store.detalle();
    if (!d) return [];
    const recorridas = [...d.historial].reverse();
    const ultimaVez = (e: EstadoPostulacion) => [...recorridas].reverse().find((c) => c.a === e);
    const visitadas = EMBUDO.filter((e) => e !== d.estado && ultimaVez(e));
    const etapas: Etapa[] = visitadas.map((e) => {
      const c = ultimaVez(e)!;
      return {
        estado: e,
        modo: 'hecha',
        fecha: c.ocurridoEn,
        detalle: this.t.translate('origenes.' + c.origen),
      };
    });
    const actual = ultimaVez(d.estado);
    etapas.push({
      estado: d.estado,
      modo: 'actual',
      fecha: actual?.ocurridoEn ?? null,
      detalle: actual?.motivo ?? '',
    });
    const siguiente = d.transicionesPosibles.find((e) => AVANCE.includes(e));
    if (siguiente) etapas.push({ estado: siguiente, modo: 'pendiente', fecha: null, detalle: '' });
    return etapas;
  });

  /** Mezcla cambios, señales, entrevistas y notas, de lo más nuevo a lo más antiguo, agrupado por día. */
  protected readonly lineaDeTiempo = computed(() => {
    const d = this.store.detalle();
    if (!d) return [];
    const p = this.pestana();
    const todos: Elemento[] = [
      ...(p === 'actividad'
        ? d.historial.map((c): Elemento => ({ tipo: 'cambio', fecha: c.ocurridoEn, c }))
        : []),
      ...(p !== 'notas'
        ? d.senales.map((s): Elemento => ({ tipo: 'senal', fecha: s.recibidaEn, s }))
        : []),
      ...(p !== 'notas'
        ? this.store
            .conversaciones()
            .map((m): Elemento => ({ tipo: 'linkedin', fecha: m.i.ocurridaEn, m }))
        : []),
      ...(p !== 'senales'
        ? d.notas.map((n): Elemento => ({ tipo: 'nota', fecha: n.creadaEn, texto: n.texto }))
        : []),
      ...(p === 'actividad'
        ? d.entrevistas.map((e): Elemento => ({
            tipo: 'entrevista',
            fecha: e.fecha,
            texto: `${this.t.translate('entrevistas.' + e.tipo)} · ${this.formato.fechaHora(e.fecha)}${e.con ? ' · ' + e.con : ''}`,
          }))
        : []),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));
    let anterior = '';
    return todos.map((e) => {
      const dia = this.formato.fechaCorta(e.fecha);
      const r = { e, dia: dia !== anterior ? dia : '' };
      anterior = dia;
      return r;
    });
  });

  protected textoDiscrepancia(x: Discrepancia, d: Detalle): string {
    const cambio = d.historial.find((c) => c.id === x.cambioId);
    const senal = d.senales.find((s) => s.id === x.senalId);
    const a = cambio ? this.t.translate('estados.' + cambio.a) : '';
    if (!senal) return x.detalle;
    return this.t.getActiveLang() === 'en'
      ? `You moved it to ${a} on ${this.formato.fechaCorta(cambio?.ocurridoEn)}, and on ${this.formato.fechaCorta(senal.recibidaEn)} this arrived: «${senal.resumen}».`
      : `La moviste a ${a} el ${this.formato.fechaCorta(cambio?.ocurridoEn)} y el ${this.formato.fechaCorta(senal.recibidaEn)} llegó: «${senal.resumen}».`;
  }

  protected async mover(a: EstadoPostulacion): Promise<void> {
    const d = this.store.detalle()!;
    const extra = await this.transiciones.datosPara(d, a);
    if (extra === null) return;
    await this.intentar(async () => {
      const nuevo = await this.store.ejecutar((x) =>
        this.api.cambiarEstado(x.id, { ...extra, a, origen: 'formulario', version: x.version }),
      );
      this.avisos.exito('tablero.movida', { estado: this.t.translate('estados.' + a) });
      if (nuevo.discrepanciasAbiertas > d.discrepanciasAbiertas)
        this.avisos.aviso('tablero.noCalza');
    });
  }

  protected async resolver(x: Discrepancia, decision: 'confirmar' | 'corregir'): Promise<void> {
    const d = this.store.detalle()!;
    if (decision === 'confirmar') {
      await this.intentar(async () => {
        await this.store.ejecutar((p) =>
          this.api.resolverDiscrepancia(p.id, x.id, { decision: 'confirmar', version: p.version }),
        );
        this.avisos.exito('ficha.resueltaConfirmada');
      });
      return;
    }
    const a = await this.transiciones.elegirDestino(d, 'dialogos.corregir.titulo');
    if (!a) return;
    const extra = await this.transiciones.datosPara(d, a);
    if (extra === null) return;
    await this.intentar(async () => {
      await this.store.ejecutar((p) =>
        this.api.resolverDiscrepancia(p.id, x.id, {
          decision: 'corregir',
          a,
          ...extra,
          version: p.version,
        }),
      );
      this.avisos.exito('ficha.resueltaCorregida');
    });
  }

  protected async agendar(): Promise<void> {
    const d = this.store.detalle()!;
    const r = await this.dialogos.abrir<EntrevistaEntrada, object>(DialogoEntrevista, {
      empresa: d.empresa,
      titulo: d.titulo,
    });
    if (r)
      await this.intentar(() => this.store.ejecutar((p) => this.api.agendarEntrevista(p.id, r)));
  }

  protected async agregarContacto(): Promise<void> {
    const d = this.store.detalle()!;
    const r = await this.dialogos.abrir<ContactoEntrada, object>(DialogoContacto, {
      empresa: d.empresa,
      titulo: d.titulo,
    });
    if (r) await this.intentar(() => this.store.ejecutar((p) => this.api.agregarContacto(p.id, r)));
  }

  protected lineaRed(c: ContactoRed): string {
    return lineaDeContacto(c);
  }

  /** Un perfil guardado sin protocolo («linkedin.com/in/…») se abre igual. */
  protected enlace(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  protected iconoFuente(fuente: string): string {
    return (
      ({ correo: '✉', plataforma: '◎', manual: '✎', ia: '✦' } as Record<string, string>)[fuente] ??
      '•'
    );
  }

  protected claseFuente(fuente: string): string {
    if (fuente === 'correo')
      return 'bg-[var(--plat-trabajando-fondo)] text-[var(--plat-trabajando-tinta)]';
    if (fuente === 'ia')
      return 'bg-[var(--plat-getonboard-fondo)] text-[var(--plat-getonboard-tinta)]';
    if (fuente === 'plataforma')
      return 'bg-[var(--plat-linkedin-fondo)] text-[var(--plat-linkedin-tinta)]';
    return 'bg-superficie text-tinta-suave';
  }

  /** Ligar a alguien de tu red, o agregar a alguien nuevo ya ligado a esta postulación. */
  protected async ligarRed(): Promise<void> {
    const d = this.store.detalle()!;
    const e = await this.dialogos.abrir<Eleccion, object>(DialogoElegirContacto, {
      empresa: d.empresa,
      titulo: d.titulo,
      ligados: this.store.red().map((c) => c.id),
    });
    if (!e) return;
    if (e.tipo === 'existente') {
      await this.intentar(async () => {
        await firstValueFrom(this.api.editarContactoRed(e.contacto.id, { vincular: d.id }));
        this.avisos.exito('ficha.ligado', { nombre: e.contacto.nombre });
        await this.store.cargarRed();
        void this.redStore.cargar(true);
      });
      return;
    }
    const nuevo = await this.dialogos.abrir<ContactoRedEntrada, object>(DialogoNuevoContacto, {
      postulacionId: d.id,
      empresa: d.empresa,
    });
    if (!nuevo) return;
    const r = await this.redStore.registrar(nuevo);
    if (!r.ok) {
      this.avisos.error(r.error);
      return;
    }
    this.avisos.exito('ficha.ligado', { nombre: r.valor.nombre });
    await this.store.cargarRed();
  }

  protected async registrarSenal(): Promise<void> {
    const d = this.store.detalle()!;
    const r = await this.dialogos.abrir<SenalEntrada, object>(DialogoSenal, {
      empresa: d.empresa,
      titulo: d.titulo,
    });
    if (!r) return;
    await this.intentar(async () => {
      const nuevo = await this.store.ejecutar((p) =>
        this.api.registrarSenal(p.id, r).pipe(map((x) => x.postulacion)),
      );
      this.avisos.exito('ficha.senalRegistrada');
      if (nuevo.discrepanciasAbiertas > d.discrepanciasAbiertas)
        this.avisos.aviso('tablero.noCalza');
    });
  }

  protected async aplicar(s: Senal): Promise<void> {
    await this.intentar(() =>
      this.store.ejecutar((p) => this.api.aplicarSenal(p.id, s.id, p.version)),
    );
  }

  protected async agregarNota(): Promise<void> {
    const texto = this.notaForm.getRawValue().texto.trim();
    if (!texto) return;
    await this.intentar(async () => {
      await this.store.ejecutar((p) => this.api.agregarNota(p.id, texto));
      this.notaForm.reset();
      this.avisos.exito('ficha.notaAgregada');
    });
  }

  protected async resultado(
    entrevistaId: string,
    resultado: (typeof this.resultados)[number],
  ): Promise<void> {
    await this.intentar(() =>
      this.store.ejecutar((p) => this.api.registrarResultado(p.id, entrevistaId, resultado)),
    );
  }

  protected empezarEdicion(d: Detalle): void {
    this.edicion.setValue({
      canalTipo: (d.canal?.tipo as 'portal') ?? 'portal',
      canalValor: d.canal?.valor ?? '',
      monto: d.sueldoPretendido?.monto ?? null,
      moneda: (d.sueldoPretendido?.moneda as 'CLP') ?? 'CLP',
      cierre: d.cierre ?? '',
    });
    this.editando.set(true);
  }

  protected async guardarEdicion(d: Detalle): Promise<void> {
    const v = this.edicion.getRawValue();
    await this.intentar(async () => {
      await this.store.ejecutar((p) =>
        this.api.editar(p.id, {
          version: p.version,
          ...(v.canalValor.trim()
            ? { canal: { tipo: v.canalTipo, valor: v.canalValor.trim() } }
            : {}),
          sueldoPretendido: v.monto
            ? {
                monto: Number(v.monto),
                moneda: v.moneda,
                periodo: d.sueldoPretendido?.periodo ?? 'mes',
                base: d.sueldoPretendido?.base ?? 'liquido',
              }
            : null,
          cierre: v.cierre || null,
        }),
      );
      this.editando.set(false);
      this.avisos.exito('ficha.guardado');
    });
  }

  private async intentar(f: () => Promise<unknown>): Promise<void> {
    try {
      await f();
    } catch (e) {
      this.avisos.error(e);
    }
  }
}
