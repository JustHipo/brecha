import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom, type Observable } from 'rxjs';
import {
  ApiArriendos,
  type ContactoPropiedad,
  type EditarPropiedad,
  type EstadoPropiedad,
  type PropiedadDetalle,
} from '../../nucleo/api/arriendos.api';
import { Avisos } from '../../nucleo/avisos';
import { ArriendosStore, aError } from './arriendos.store';
import { GaleriaFotos } from './fotos';
import { CalceArriendo, DialogoMover, pesos, precioTexto } from './piezas';

const ROLES = ['corredor', 'dueno', 'conserje', 'administracion', 'otro'] as const;
const TIPOS = ['departamento', 'casa', 'pieza', 'otro'] as const;
const INTERACCIONES = ['mensaje_enviado', 'mensaje_recibido', 'llamada', 'nota'] as const;

interface Edicion {
  titulo: string;
  tipo: string;
  direccion: string;
  comuna: string;
  monto: number | null;
  moneda: 'CLP' | 'UF';
  gastosComunes: number | null;
  dormitorios: number | null;
  banos: number | null;
  m2Utiles: number | null;
  estacionamientos: number | null;
  mascotas: string;
  amoblado: string;
  disponibleDesde: string;
  rentaVeces: number | null;
  aval: string;
  mesesGarantia: number | null;
  descripcion: string;
}

const siNo = (v: boolean | undefined) => (v === undefined ? '' : v ? 'si' : 'no');
const deSiNo = (v: string) => (v === '' ? null : v === 'si');
const nulo = <T>(v: T | '' | undefined | null) => (v === '' || v === undefined ? null : v);

/** Ficha de una propiedad (docs/diseno/arriendos.md §5): todo a la vista y editable. */
@Component({
  selector: 'b-ficha-propiedad',
  imports: [
    RouterLink,
    TranslocoPipe,
    FormsModule,
    HlmButton,
    HlmInput,
    CalceArriendo,
    DialogoMover,
    GaleriaFotos,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <a routerLink="/arriendos/tablero" class="text-tinta-suave no-underline hover:underline"
      >← {{ 'arriendos.volver' | transloco }}</a
    >
    @if (error()) {
      <div
        role="alert"
        class="rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
      >
        {{ error()!.clave | transloco }}
      </div>
    }
    @if (p(); as p) {
      <header class="flex flex-wrap items-start gap-3">
        <div class="min-w-[260px] flex-1">
          <h1 class="titulo-pagina m-0">{{ p.titulo }}</h1>
          <p class="mt-1 mb-0 flex flex-wrap items-center gap-2 text-tinta-suave">
            <span
              class="rounded-full bg-superficie px-2.5 py-0.5 font-semibold text-tinta"
              data-estado-propiedad
              >{{ 'estadosArriendo.' + p.estado | transloco }}</span
            >
            <span class="tabular-nums">{{ precio(p) }}</span>
            @if (p.gastosComunes) {
              <span>+ {{ pesos(p.gastosComunes) }} {{ 'arriendos.gc' | transloco }}</span>
            }
            <b-calce-arriendo [calce]="p.calce" />
            @if (p.motivoCierre) {
              <span>· {{ p.motivoCierre }}</span>
            }
          </p>
        </div>
        <div
          class="flex flex-wrap gap-2"
          role="group"
          [attr.aria-label]="'arriendos.moverA' | transloco: { estado: '' }"
        >
          @for (e of p.transicionesPosibles; track e) {
            <button hlmBtn variant="outline" size="sm" type="button" (click)="mover(e)">
              → {{ 'estadosArriendo.' + e | transloco }}
            </button>
          }
          @if (confirmarBorrar()) {
            <button hlmBtn variant="destructive" size="sm" type="button" (click)="borrar()">
              {{ 'arriendos.siBorrar' | transloco }}
            </button>
          } @else {
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              (click)="confirmarBorrar.set(true)"
            >
              {{ 'arriendos.borrar' | transloco }}
            </button>
          }
        </div>
      </header>

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex min-w-0 flex-col gap-5">
          <!-- Fotos (docs/diseno/fotos-propiedades.md §6) -->
          <b-galeria-fotos
            [propiedadId]="p.id"
            [titulo]="p.titulo"
            [fotos]="p.fotos"
            (cambio)="fotosCambiaron()"
          />

          <!-- Calce -->
          <section
            class="flex flex-col gap-2 rounded-[12px] border border-linea p-4"
            aria-labelledby="t-calce"
          >
            <h2 id="t-calce" class="m-0 text-base font-bold">
              {{ 'arriendos.calceTitulo' | transloco }}
            </h2>
            @if (!p.calce.brechas.length && !p.calce.sinDato.length) {
              <p class="m-0 text-tinta-suave">
                {{
                  (p.calce.puntaje === null ? 'arriendos.sinReglas' : 'arriendos.calceCumple')
                    | transloco
                }}
              </p>
            }
            <ul class="m-0 flex flex-col gap-1 pl-5">
              @for (b of p.calce.brechas; track b.reglaId) {
                <li [class.text-error]="b.dura">
                  <strong>{{ b.dura ? ('arriendos.dura' | transloco) : 'P' + b.prioridad }}</strong>
                  · {{ b.texto }}
                </li>
              }
              @for (s of p.calce.sinDato; track s.reglaId) {
                <li class="text-tinta-suave">{{ s.texto }}</li>
              }
            </ul>
            <a routerLink="/arriendos/busqueda" class="text-[13px]">{{
              'arriendos.editarReglas' | transloco
            }}</a>
          </section>

          <!-- Datos -->
          <section
            class="flex flex-col gap-3 rounded-[12px] border border-linea p-4"
            aria-labelledby="t-datos"
          >
            <div class="flex items-center gap-2">
              <h2 id="t-datos" class="m-0 flex-1 text-base font-bold">
                {{ 'arriendos.datos' | transloco }}
              </h2>
              @if (!editando()) {
                <button hlmBtn variant="outline" size="sm" type="button" (click)="editar()">
                  {{ 'arriendos.editar' | transloco }}
                </button>
              }
            </div>
            @if (editando()) {
              <form
                class="grid grid-cols-2 gap-3 md:grid-cols-3"
                (submit)="$event.preventDefault(); guardar()"
              >
                <label class="col-span-2 flex flex-col gap-1 md:col-span-3">
                  <span class="font-semibold">{{ 'arriendos.campos.titulo' | transloco }}</span>
                  <input hlmInput name="titulo" [(ngModel)]="ed.titulo" />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{ 'arriendos.campos.tipo' | transloco }}</span>
                  <select hlmInput name="tipo" [(ngModel)]="ed.tipo">
                    @for (t of tipos; track t) {
                      <option [value]="t">{{ 'tiposPropiedad.' + t | transloco }}</option>
                    }
                  </select>
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{ 'arriendos.campos.direccion' | transloco }}</span>
                  <input hlmInput name="direccion" [(ngModel)]="ed.direccion" />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{ 'arriendos.campos.comuna' | transloco }}</span>
                  <input hlmInput name="comuna" [(ngModel)]="ed.comuna" />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{ 'arriendos.campos.precio' | transloco }}</span>
                  <input
                    hlmInput
                    type="number"
                    min="0"
                    step="any"
                    name="monto"
                    [(ngModel)]="ed.monto"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{ 'arriendos.campos.moneda' | transloco }}</span>
                  <select hlmInput name="moneda" [(ngModel)]="ed.moneda">
                    <option value="CLP">CLP</option>
                    <option value="UF">UF</option>
                  </select>
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{
                    'arriendos.campos.gastosComunes' | transloco
                  }}</span>
                  <input hlmInput type="number" min="0" name="gc" [(ngModel)]="ed.gastosComunes" />
                </label>
                @for (n of numeros; track n) {
                  <label class="flex flex-col gap-1">
                    <span class="font-semibold">{{ 'arriendos.campos.' + n | transloco }}</span>
                    <input hlmInput type="number" min="0" [name]="n" [(ngModel)]="ed[n]" />
                  </label>
                }
                @for (b of siNos; track b) {
                  <label class="flex flex-col gap-1">
                    <span class="font-semibold">{{ 'arriendos.campos.' + b | transloco }}</span>
                    <select hlmInput [name]="b" [(ngModel)]="ed[b]">
                      <option value="">{{ 'arriendos.noDice' | transloco }}</option>
                      <option value="si">{{ 'arriendos.si' | transloco }}</option>
                      <option value="no">{{ 'arriendos.no' | transloco }}</option>
                    </select>
                  </label>
                }
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{
                    'arriendos.campos.disponibleDesde' | transloco
                  }}</span>
                  <input hlmInput type="date" name="disp" [(ngModel)]="ed.disponibleDesde" />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{ 'arriendos.campos.rentaVeces' | transloco }}</span>
                  <input
                    hlmInput
                    type="number"
                    min="0"
                    step="0.1"
                    name="renta"
                    [(ngModel)]="ed.rentaVeces"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="font-semibold">{{
                    'arriendos.campos.mesesGarantia' | transloco
                  }}</span>
                  <input
                    hlmInput
                    type="number"
                    min="0"
                    step="0.5"
                    name="garantia"
                    [(ngModel)]="ed.mesesGarantia"
                  />
                </label>
                <label class="col-span-2 flex flex-col gap-1 md:col-span-3">
                  <span class="font-semibold">{{
                    'arriendos.campos.descripcion' | transloco
                  }}</span>
                  <textarea
                    hlmInput
                    class="min-h-20"
                    name="desc"
                    [(ngModel)]="ed.descripcion"
                  ></textarea>
                </label>
                <div class="col-span-2 flex justify-end gap-2 md:col-span-3">
                  <button hlmBtn variant="ghost" type="button" (click)="editando.set(false)">
                    {{ 'dialogos.cancelar' | transloco }}
                  </button>
                  <button hlmBtn type="submit">{{ 'arriendos.guardar' | transloco }}</button>
                </div>
              </form>
            } @else {
              <dl class="m-0 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
                @for (f of filas(); track f.k) {
                  <div class="flex flex-col">
                    <dt class="text-[12.5px] text-tinta-suave">
                      {{ 'arriendos.campos.' + f.k | transloco }}
                    </dt>
                    <dd class="m-0">{{ f.v }}</dd>
                  </div>
                }
              </dl>
              @if (p.descripcion) {
                <p class="m-0 whitespace-pre-line text-tinta-suave">{{ p.descripcion }}</p>
              }
            }
          </section>

          <!-- Publicaciones -->
          <section
            class="flex flex-col gap-2 rounded-[12px] border border-linea p-4"
            aria-labelledby="t-pub"
          >
            <h2 id="t-pub" class="m-0 text-base font-bold">
              {{ 'arriendos.publicaciones' | transloco }}
            </h2>
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              @for (x of p.publicaciones; track x.id) {
                <li class="flex flex-wrap gap-2">
                  <span class="font-semibold">{{ store.nombreCanal()(x.canalId) }}</span>
                  @if (x.url) {
                    <a [href]="x.url" target="_blank" rel="noopener noreferrer" class="break-all"
                      >{{ x.url }} ↗</a
                    >
                  }
                </li>
              }
            </ul>
            <form
              class="flex flex-wrap items-end gap-2"
              (submit)="$event.preventDefault(); publicar()"
            >
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.canal' | transloco }}</span>
                <select hlmInput name="canalPub" [(ngModel)]="pub.canalId">
                  <option value="">{{ 'arriendos.porUrl' | transloco }}</option>
                  @for (c of store.canales(); track c.id) {
                    <option [value]="c.id">{{ c.nombre }}</option>
                  }
                </select>
              </label>
              <label class="flex min-w-[240px] flex-1 flex-col gap-1">
                <span class="text-[12.5px]">URL</span>
                <input hlmInput name="urlPub" [(ngModel)]="pub.url" />
              </label>
              <button hlmBtn variant="outline" type="submit" [disabled]="!pub.url && !pub.canalId">
                {{ 'arriendos.agregar' | transloco }}
              </button>
            </form>
          </section>

          <!-- Contactos -->
          <section
            class="flex flex-col gap-3 rounded-[12px] border border-linea p-4"
            aria-labelledby="t-cont"
          >
            <h2 id="t-cont" class="m-0 text-base font-bold">
              {{ 'arriendos.contactos' | transloco }}
            </h2>
            @for (c of p.contactos; track c.id) {
              <article
                class="flex flex-col gap-2 rounded-[10px] bg-superficie p-3"
                [attr.data-contacto]="c.nombre"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <strong>{{ c.nombre }}</strong>
                  <span class="text-tinta-suave">· {{ 'roles.' + c.rol | transloco }}</span>
                  @if (c.canalId) {
                    <span class="rounded-full bg-fondo px-2 py-px text-[11.5px]">{{
                      store.nombreCanal()(c.canalId)
                    }}</span>
                  }
                </div>
                <div class="flex flex-wrap gap-3 text-[13px]">
                  @if (c.telefono) {
                    <a [href]="'tel:' + c.telefono">{{ c.telefono }}</a>
                  }
                  @if (c.whatsapp) {
                    <a
                      [href]="'https://wa.me/' + c.whatsapp.replace('+', '')"
                      target="_blank"
                      rel="noopener noreferrer"
                      >WhatsApp {{ c.whatsapp }} ↗</a
                    >
                  }
                  @if (c.correo) {
                    <a [href]="'mailto:' + c.correo">{{ c.correo }}</a>
                  }
                  @if (c.enlace) {
                    <a [href]="c.enlace" target="_blank" rel="noopener noreferrer"
                      >{{ 'arriendos.enlace' | transloco }} ↗</a
                    >
                  }
                  @if (c.linkedin) {
                    <a [href]="c.linkedin" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>
                  }
                </div>
                @if (c.interacciones.length) {
                  <ol class="m-0 flex list-none flex-col gap-1 border-l-2 border-linea p-0 pl-3">
                    @for (i of c.interacciones; track i.id) {
                      <li class="text-[13px]">
                        <span class="text-tinta-suave"
                          >{{ fecha(i.ocurridaEn) }} ·
                          {{ 'interaccionesArriendo.' + i.tipo | transloco }}
                          @if (i.canalId) {
                            · {{ store.nombreCanal()(i.canalId) }}
                          }
                        </span>
                        <span class="block whitespace-pre-line">{{ i.resumen }}</span>
                      </li>
                    }
                  </ol>
                }
                <form
                  class="flex flex-wrap items-end gap-2"
                  (submit)="$event.preventDefault(); conversar(c)"
                >
                  <label class="flex flex-col gap-1">
                    <span class="text-[12.5px]">{{ 'arriendos.tipo' | transloco }}</span>
                    <select hlmInput [name]="'tipo-' + c.id" [(ngModel)]="conv.tipo">
                      @for (t of interacciones; track t) {
                        <option [value]="t">{{ 'interaccionesArriendo.' + t | transloco }}</option>
                      }
                    </select>
                  </label>
                  <label class="flex min-w-[220px] flex-1 flex-col gap-1">
                    <span class="text-[12.5px]">{{ 'arriendos.queDijeron' | transloco }}</span>
                    <input hlmInput [name]="'res-' + c.id" [(ngModel)]="conv.resumen" />
                  </label>
                  <button
                    hlmBtn
                    variant="outline"
                    size="sm"
                    type="submit"
                    [disabled]="!conv.resumen.trim()"
                  >
                    {{ 'arriendos.registrar' | transloco }}
                  </button>
                </form>
              </article>
            }
            <form
              class="grid grid-cols-2 gap-2 md:grid-cols-4"
              (submit)="$event.preventDefault(); agregarContacto()"
              aria-labelledby="t-nuevo-cont"
            >
              <p id="t-nuevo-cont" class="col-span-2 m-0 font-semibold md:col-span-4">
                {{ 'arriendos.nuevoContacto' | transloco }}
              </p>
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.nombre' | transloco }}</span>
                <input hlmInput name="cNombre" [(ngModel)]="nc.nombre" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.rol' | transloco }}</span>
                <select hlmInput name="cRol" [(ngModel)]="nc.rol">
                  @for (r of roles; track r) {
                    <option [value]="r">{{ 'roles.' + r | transloco }}</option>
                  }
                </select>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.telefono' | transloco }}</span>
                <input hlmInput name="cTel" [(ngModel)]="nc.telefono" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.canalHablan' | transloco }}</span>
                <select hlmInput name="cCanal" [(ngModel)]="nc.canalId">
                  <option value="">—</option>
                  @for (x of store.canales(); track x.id) {
                    <option [value]="x.id">{{ x.nombre }}</option>
                  }
                </select>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.correo' | transloco }}</span>
                <input hlmInput type="email" name="cCorreo" [(ngModel)]="nc.correo" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.enlace' | transloco }}</span>
                <input hlmInput name="cEnlace" [(ngModel)]="nc.enlace" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">LinkedIn</span>
                <input hlmInput name="cLinkedin" [(ngModel)]="nc.linkedin" />
              </label>
              <div class="flex items-end">
                <button hlmBtn variant="outline" type="submit" [disabled]="!nc.nombre.trim()">
                  {{ 'arriendos.agregar' | transloco }}
                </button>
              </div>
            </form>
          </section>

          <!-- Visitas -->
          <section
            class="flex flex-col gap-2 rounded-[12px] border border-linea p-4"
            aria-labelledby="t-vis"
          >
            <h2 id="t-vis" class="m-0 text-base font-bold">
              {{ 'arriendos.visitas' | transloco }}
            </h2>
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              @for (v of p.visitas; track v.id) {
                <li class="flex flex-wrap items-center gap-2">
                  <span>{{ fecha(v.fecha) }}</span>
                  <span class="text-tinta-suave">· {{ 'visitas.' + v.estado | transloco }}</span>
                  @if (v.estado === 'agendada') {
                    <button
                      hlmBtn
                      variant="ghost"
                      size="xs"
                      type="button"
                      (click)="visita(v.id, 'hecha')"
                    >
                      {{ 'visitas.marcarHecha' | transloco }}
                    </button>
                    <button
                      hlmBtn
                      variant="ghost"
                      size="xs"
                      type="button"
                      (click)="visita(v.id, 'cancelada')"
                    >
                      {{ 'visitas.cancelar' | transloco }}
                    </button>
                  }
                </li>
              }
            </ul>
            <form
              class="flex flex-wrap items-end gap-2"
              (submit)="$event.preventDefault(); agendar()"
            >
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.fechaVisita' | transloco }}</span>
                <input
                  hlmInput
                  type="datetime-local"
                  name="nuevaVisita"
                  [(ngModel)]="nuevaVisita"
                />
              </label>
              <button hlmBtn variant="outline" type="submit" [disabled]="!nuevaVisita">
                {{ 'arriendos.agendar' | transloco }}
              </button>
            </form>
            @if (p.documentosEnviados.length) {
              <p class="m-0 text-[13px] text-tinta-suave">
                {{ 'arriendos.documentosEnviados' | transloco }}:
                {{ p.documentosEnviados.join(', ') }}
              </p>
            }
          </section>

          <!-- Notas -->
          <section
            class="flex flex-col gap-2 rounded-[12px] border border-linea p-4"
            aria-labelledby="t-notas"
            id="nota"
          >
            <h2 id="t-notas" class="m-0 text-base font-bold">
              {{ 'arriendos.notas' | transloco }}
            </h2>
            <form class="flex gap-2" (submit)="$event.preventDefault(); anotar()">
              <label class="flex flex-1 flex-col">
                <span class="solo-lector">{{ 'arriendos.nuevaNota' | transloco }}</span>
                <input
                  hlmInput
                  name="nota"
                  [(ngModel)]="nota"
                  [placeholder]="'arriendos.nuevaNota' | transloco"
                />
              </label>
              <button hlmBtn variant="outline" type="submit" [disabled]="!nota.trim()">
                {{ 'arriendos.agregar' | transloco }}
              </button>
            </form>
            @for (n of p.notas; track n.id) {
              <p class="m-0 whitespace-pre-line">
                <span class="text-[12.5px] text-tinta-suave">{{ fecha(n.creadaEn) }} · </span
                >{{ n.texto }}
              </p>
            }
          </section>
        </div>

        <!-- Actividad -->
        <aside
          class="flex flex-col gap-4 rounded-[12px] border border-linea bg-superficie-panel p-4"
          [attr.aria-label]="'arriendos.actividad' | transloco"
        >
          @for (d of p.discrepancias; track d.id) {
            @if (d.estado === 'abierta') {
              <div
                class="flex flex-col gap-1 rounded-[10px] border border-aviso-borde bg-aviso-fondo p-3 text-aviso-tinta"
              >
                <strong>⚠ {{ 'arriendos.discrepancia' | transloco }}</strong>
                <span>{{ d.detalle }}</span>
                <button
                  hlmBtn
                  variant="outline"
                  size="xs"
                  type="button"
                  class="self-start"
                  (click)="resolver(d.id)"
                >
                  {{ 'arriendos.resolver' | transloco }}
                </button>
              </div>
            }
          }
          <h2 class="m-0 text-base font-bold">{{ 'arriendos.senales' | transloco }}</h2>
          @for (s of p.senales; track s.id) {
            <div class="flex flex-col gap-1 text-[13px]">
              <span class="text-tinta-suave"
                >{{ fecha(s.recibidaEn) }} · {{ 'fuentesArriendo.' + s.fuente | transloco }}</span
              >
              <span>{{ s.resumen }}</span>
              @if (
                s.estadoSugerido && !s.aplicada && p.transicionesPosibles.includes(s.estadoSugerido)
              ) {
                <button
                  hlmBtn
                  variant="outline"
                  size="xs"
                  type="button"
                  class="self-start"
                  (click)="aplicar(s.id)"
                >
                  {{
                    'arriendos.aplicar'
                      | transloco: { estado: ('estadosArriendo.' + s.estadoSugerido | transloco) }
                  }}
                </button>
              }
            </div>
          } @empty {
            <p class="m-0 text-[13px] text-tinta-suave">{{ 'arriendos.sinSenales' | transloco }}</p>
          }
          <h2 class="m-0 text-base font-bold">{{ 'arriendos.historial' | transloco }}</h2>
          <ol class="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            @for (c of p.cambios; track $index) {
              <li>
                <span class="text-tinta-suave"
                  >{{ fecha(c.ocurridoEn) }} ·
                  {{ 'origenesArriendo.' + c.origen | transloco }}</span
                >
                <span class="block"
                  >{{ 'estadosArriendo.' + c.a | transloco }}
                  @if (c.motivo) {
                    · {{ c.motivo }}
                  }
                </span>
              </li>
            }
          </ol>
        </aside>
      </div>
    }
    <b-dialogo-mover />
  `,
})
export class FichaPropiedadPagina {
  readonly id = input.required<string>();
  protected readonly store = inject(ArriendosStore);
  private readonly api = inject(ApiArriendos);
  private readonly avisos = inject(Avisos);
  private readonly router = inject(Router);
  private readonly t = inject(TranslocoService);
  private readonly dialogo = viewChild.required(DialogoMover);

  protected readonly p = signal<PropiedadDetalle | null>(null);
  protected readonly error = signal<ReturnType<typeof aError> | null>(null);
  protected readonly editando = signal(false);
  protected readonly confirmarBorrar = signal(false);
  protected readonly precio = precioTexto;
  protected readonly pesos = pesos;
  protected readonly roles = ROLES;
  protected readonly tipos = TIPOS;
  protected readonly interacciones = INTERACCIONES;
  protected readonly numeros = ['dormitorios', 'banos', 'm2Utiles', 'estacionamientos'] as const;
  protected readonly siNos = ['mascotas', 'amoblado', 'aval'] as const;

  protected ed = {} as Edicion;
  protected pub = { canalId: '', url: '' };
  protected nc = {
    nombre: '',
    rol: 'corredor',
    telefono: '',
    correo: '',
    canalId: '',
    enlace: '',
    linkedin: '',
  };
  protected conv: { tipo: string; resumen: string } = { tipo: 'mensaje_recibido', resumen: '' };
  protected nuevaVisita = '';
  protected nota = '';

  protected readonly filas = computed(() => {
    const p = this.p();
    if (!p) return [];
    const si = (b?: boolean) =>
      b === undefined ? null : this.t.translate(b ? 'arriendos.si' : 'arriendos.no');
    const filas: [string, string | number | null | undefined][] = [
      ['tipo', this.t.translate(`tiposPropiedad.${p.tipo}`)],
      ['direccion', p.direccion],
      ['comuna', p.comuna],
      ['dormitorios', p.dormitorios],
      ['banos', p.banos],
      ['m2Utiles', p.m2Utiles ?? p.m2],
      ['estacionamientos', p.estacionamientos],
      ['mascotas', si(p.mascotas)],
      ['amoblado', si(p.amoblado)],
      ['disponibleDesde', p.disponibleDesde],
      ['rentaVeces', p.requisitos.rentaVeces ? `${p.requisitos.rentaVeces}x` : null],
      ['aval', si(p.requisitos.aval)],
      ['mesesGarantia', p.requisitos.mesesGarantia],
    ];
    return filas
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => ({ k, v }));
  });

  constructor() {
    effect(() => void this.cargar(this.id()));
    if (this.store.estado() === 'inicial') void this.store.cargar();
  }

  private async cargar(id: string): Promise<void> {
    try {
      this.p.set(await firstValueFrom(this.api.ver(id)));
      this.error.set(null);
    } catch (e) {
      this.error.set(aError(e));
    }
  }

  /** La galería cambió las fotos: la ficha y el tablero (portada) se ponen al día. */
  protected fotosCambiaron(): void {
    void this.cargar(this.id());
    void this.store.cargar(true);
  }

  private async hacer(o: Observable<PropiedadDetalle>, exito?: string): Promise<boolean> {
    try {
      this.p.set(await firstValueFrom(o));
      if (exito) this.avisos.exito(exito);
      void this.store.cargar(true);
      return true;
    } catch (e) {
      this.avisos.error(e);
      return false;
    }
  }

  protected fecha(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected async mover(a: EstadoPropiedad): Promise<void> {
    const p = this.p();
    if (!p) return;
    const cuerpo = await this.dialogo().pedir(a);
    if (!cuerpo) return;
    await this.hacer(
      this.api.cambiarEstado(p.id, { ...cuerpo, version: p.version }),
      'arriendos.guardado',
    );
  }

  protected editar(): void {
    const p = this.p()!;
    this.ed = {
      titulo: p.titulo,
      tipo: p.tipo,
      direccion: p.direccion ?? '',
      comuna: p.comuna ?? '',
      monto: p.precio?.monto ?? null,
      moneda: (p.precio?.moneda as 'CLP' | 'UF') ?? 'CLP',
      gastosComunes: p.gastosComunes,
      dormitorios: p.dormitorios,
      banos: p.banos,
      m2Utiles: p.m2Utiles ?? null,
      estacionamientos: p.estacionamientos ?? null,
      mascotas: siNo(p.mascotas),
      amoblado: siNo(p.amoblado),
      disponibleDesde: p.disponibleDesde ?? '',
      rentaVeces: p.requisitos.rentaVeces ?? null,
      aval: siNo(p.requisitos.aval),
      mesesGarantia: p.requisitos.mesesGarantia ?? null,
      descripcion: p.descripcion ?? '',
    };
    this.editando.set(true);
  }

  protected async guardar(): Promise<void> {
    const p = this.p()!;
    const e = this.ed;
    const cuerpo: EditarPropiedad = {
      version: p.version,
      titulo: nulo(e.titulo),
      tipo: e.tipo as EditarPropiedad['tipo'],
      direccion: nulo(e.direccion),
      comuna: nulo(e.comuna),
      precio: e.monto ? { monto: Number(e.monto), moneda: e.moneda } : null,
      gastosComunes: nulo(e.gastosComunes),
      dormitorios: nulo(e.dormitorios),
      banos: nulo(e.banos),
      m2Utiles: nulo(e.m2Utiles),
      estacionamientos: nulo(e.estacionamientos),
      mascotas: deSiNo(e.mascotas),
      amoblado: deSiNo(e.amoblado),
      disponibleDesde: nulo(e.disponibleDesde),
      descripcion: nulo(e.descripcion),
      requisitos: {
        ...p.requisitos,
        rentaVeces: nulo(e.rentaVeces),
        aval: deSiNo(e.aval),
        mesesGarantia: nulo(e.mesesGarantia),
      },
    };
    if (await this.hacer(this.api.editar(p.id, cuerpo), 'arriendos.guardado'))
      this.editando.set(false);
  }

  protected async publicar(): Promise<void> {
    const p = this.p()!;
    const ok = await this.hacer(
      this.api.agregarPublicacion(p.id, {
        ...(this.pub.canalId ? { canalId: this.pub.canalId } : {}),
        ...(this.pub.url.trim() ? { url: this.pub.url.trim() } : {}),
      }),
    );
    if (ok) this.pub = { canalId: '', url: '' };
  }

  protected async agregarContacto(): Promise<void> {
    const p = this.p()!;
    const c = Object.fromEntries(Object.entries(this.nc).filter(([, v]) => v.trim() !== ''));
    try {
      const r = await firstValueFrom(this.api.registrarContacto(p.id, c as never));
      this.p.set(r.propiedad);
      this.nc = {
        nombre: '',
        rol: 'corredor',
        telefono: '',
        correo: '',
        canalId: '',
        enlace: '',
        linkedin: '',
      };
    } catch (e) {
      this.avisos.error(e);
    }
  }

  protected async conversar(c: ContactoPropiedad): Promise<void> {
    const p = this.p()!;
    try {
      const r = await firstValueFrom(
        this.api.registrarInteraccion(p.id, {
          contactoId: c.id,
          tipo: this.conv.tipo as never,
          resumen: this.conv.resumen.trim(),
          ...(c.canalId ? { canalId: c.canalId } : {}),
        }),
      );
      this.p.set(r.propiedad);
      this.conv = { tipo: this.conv.tipo, resumen: '' };
      void this.store.cargar(true);
    } catch (e) {
      this.avisos.error(e);
    }
  }

  protected async agendar(): Promise<void> {
    const p = this.p()!;
    if (
      await this.hacer(
        this.api.agendarVisita(p.id, { fecha: new Date(this.nuevaVisita).toISOString() }),
      )
    )
      this.nuevaVisita = '';
  }

  protected async visita(visitaId: string, estado: 'hecha' | 'cancelada'): Promise<void> {
    await this.hacer(this.api.cambiarVisita(this.p()!.id, visitaId, estado));
  }

  protected async anotar(): Promise<void> {
    if (await this.hacer(this.api.agregarNota(this.p()!.id, this.nota.trim()))) this.nota = '';
  }

  protected async resolver(id: string): Promise<void> {
    await this.hacer(this.api.resolverDiscrepancia(this.p()!.id, id));
  }

  protected async aplicar(senalId: string): Promise<void> {
    await this.hacer(this.api.aplicarSenal(this.p()!.id, senalId), 'arriendos.guardado');
  }

  protected async borrar(): Promise<void> {
    try {
      await firstValueFrom(this.api.borrar(this.p()!.id));
      void this.store.cargar(true);
      this.avisos.exito('arriendos.borrada');
      void this.router.navigate(['/arriendos/tablero']);
    } catch (e) {
      this.avisos.error(e);
    }
  }
}
