import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import type { ContactoRed, ContactoRedEntrada, FiltroDeRed } from '../../nucleo/api/api.service';
import { Avisos } from '../../nucleo/avisos';
import { Formato } from '../../nucleo/idioma/idioma';
import { Avatar } from '../../compartido/piezas';
import { Dialogos } from '../postulacion/dialogos/dialogos.service';
import { TableroStore } from '../tablero/tablero.store';
import { DialogoNuevoContacto, lineaDeContacto } from './dialogos';
import { ConexionRed, PendienteRed } from './piezas';
import { FILTROS, RedStore } from './red.store';

/**
 * Red (f2.md §8): tu red de LinkedIn con quién te debe y a quién le debes un mensaje, ligada a tus
 * postulaciones. LinkedIn no tiene API: Claude la mantiene al día por MCP desde tu navegador.
 */
@Component({
  selector: 'b-red',
  imports: [RouterLink, TranslocoPipe, HlmButton, HlmInput, Avatar, ConexionRed, PendienteRed],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-[260px] flex-1">
        <h1 class="titulo-pagina m-0">{{ 'red.titulo' | transloco }}</h1>
        @if (store.resumen(); as r) {
          <p class="mt-0.5 mb-0 text-tinta-suave">
            {{
              'red.resumen'
                | transloco
                  : { total: r.total, conectados: r.conectados, porResponder: r.porResponder }
            }}
          </p>
        }
      </div>
      <button hlmBtn type="button" (click)="nuevo()">+ {{ 'red.nuevoBoton' | transloco }}</button>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div
        role="group"
        class="flex flex-wrap gap-1.5"
        [attr.aria-label]="'red.filtrosEtiqueta' | transloco"
      >
        @for (f of filtros; track f) {
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-full border px-3"
            [class.border-tinta]="store.filtro() === f"
            [class.bg-tinta]="store.filtro() === f"
            [class.text-white]="store.filtro() === f"
            [class.border-linea]="store.filtro() !== f"
            [class.bg-fondo]="store.filtro() !== f"
            [attr.aria-pressed]="store.filtro() === f"
            (click)="store.filtrar(f)"
          >
            {{ 'red.filtros.' + f | transloco }}
            @if (conteo(f); as n) {
              <span class="text-xs font-semibold tabular-nums">{{ n }}</span>
            }
          </button>
        }
      </div>
      <label class="ml-auto flex items-center gap-2">
        <span class="solo-lector">{{ 'red.buscar' | transloco }}</span>
        <input
          hlmInput
          type="search"
          class="w-72"
          [placeholder]="'red.buscar' | transloco"
          [value]="store.texto()"
          (input)="store.buscar($any($event.target).value)"
        />
      </label>
    </div>

    @if (store.error(); as e) {
      <div
        role="alert"
        class="flex max-w-5xl items-center gap-3 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
      >
        <span class="flex-1">{{ e.clave | transloco }}</span>
        <button hlmBtn variant="outline" size="sm" type="button" (click)="store.cargar()">
          {{ 'tablero.reintentar' | transloco }}
        </button>
      </div>
    }

    @if (store.estado() === 'listo' && store.vacia()) {
      <section
        class="flex max-w-3xl flex-col gap-2 rounded-[14px] border border-dashed border-[#D8D1C6] bg-superficie px-6 py-6"
        aria-labelledby="red-vacia"
      >
        <h2 id="red-vacia" class="m-0 font-titulo text-lg font-extrabold">
          {{ 'red.vaciaTitulo' | transloco }}
        </h2>
        <p class="m-0 text-[#4A4440]">{{ 'red.vaciaTexto' | transloco }}</p>
        <p class="m-0 text-[12.5px] text-tinta-suave">{{ 'red.vaciaComo' | transloco }}</p>
        <div>
          <button hlmBtn variant="outline" size="sm" type="button" (click)="nuevo()">
            + {{ 'red.nuevoBoton' | transloco }}
          </button>
        </div>
      </section>
    } @else {
      <ul
        class="m-0 flex max-w-5xl list-none flex-col gap-2.5 p-0"
        [attr.aria-busy]="store.estado() === 'cargando'"
        [attr.aria-label]="'red.lista' | transloco"
      >
        @for (c of store.items(); track c.id) {
          <li
            class="flex flex-col gap-2 rounded-[12px] border bg-fondo px-4 py-3 shadow-tarjeta"
            [class.border-[#F3C9B5]]="c.pendiente === 'responder'"
            [class.border-linea]="c.pendiente !== 'responder'"
            [attr.data-contacto]="c.id"
          >
            <div class="flex flex-wrap items-start gap-3">
              <b-avatar [empresa]="c.nombre" [tamano]="36" />
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2 class="m-0 font-sans text-[15px] font-semibold">
                  <a
                    [routerLink]="['/red', c.id]"
                    class="text-tinta no-underline hover:underline"
                    >{{ c.nombre }}</a
                  >
                </h2>
                @if (linea(c); as l) {
                  <span class="truncate text-tinta-suave">{{ l }}</span>
                }
              </div>
              <b-conexion-red [conexion]="c.conexion" />
              <b-pendiente-red [contacto]="c" />
            </div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 pl-12 text-[12.5px]">
              @if (c.ultimaInteraccion; as u) {
                <span class="min-w-0 flex-1 text-[#3C3632]">
                  <span class="font-semibold">{{ 'red.tipos.' + u.tipo | transloco }}:</span>
                  {{ u.resumen }}
                  <span class="text-tinta-suave"> · {{ formato.fechaCorta(u.ocurridaEn) }}</span>
                </span>
              } @else {
                <span class="flex-1 text-tinta-suave">{{
                  'red.sinInteracciones' | transloco
                }}</span>
              }
              @if (c.seguimiento) {
                <span
                  [class.text-error]="c.seguimientoVencido"
                  [class.font-semibold]="c.seguimientoVencido"
                  [class.text-tinta-suave]="!c.seguimientoVencido"
                  >{{
                    (c.seguimientoVencido ? 'red.seguimientoVencido' : 'red.seguimiento')
                      | transloco: { fecha: formato.fechaCorta(c.seguimiento) }
                  }}</span
                >
              }
            </div>
            <div class="flex flex-wrap items-center gap-1.5 pl-12">
              @for (p of c.postulacionIds; track p) {
                <a
                  [routerLink]="['/postulaciones', p]"
                  class="inline-flex h-7 items-center rounded-full border border-linea bg-superficie px-2.5 text-[12.5px] text-tinta no-underline hover:bg-fondo"
                  >{{ postulacion(p) }}</a
                >
              }
              <span class="flex-1"></span>
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
            </div>
          </li>
        } @empty {
          @if (store.estado() === 'listo') {
            <li class="rounded-[12px] border border-linea px-4 py-6 text-center text-tinta-suave">
              {{ 'red.sinResultados' | transloco }}
            </li>
          } @else if (store.estado() === 'cargando') {
            <li class="py-6 text-tinta-suave" role="status">{{ 'red.cargando' | transloco }}</li>
          }
        }
      </ul>
    }
  `,
})
export class RedPagina {
  protected readonly store = inject(RedStore);
  protected readonly formato = inject(Formato);
  private readonly tablero = inject(TableroStore);
  private readonly dialogos = inject(Dialogos);
  private readonly avisos = inject(Avisos);
  private readonly router = inject(Router);
  protected readonly filtros = FILTROS;

  constructor() {
    void this.store.cargar(this.store.estado() === 'listo');
  }

  protected conteo(f: FiltroDeRed): number {
    const r = this.store.resumen();
    if (!r) return 0;
    if (f === 'responder') return r.porResponder;
    if (f === 'esperando') return r.esperando;
    if (f === 'seguimiento') return r.seguimientosVencidos;
    if (f === 'todos') return r.total;
    return 0;
  }

  protected linea(c: ContactoRed): string {
    return lineaDeContacto(c);
  }

  /** Nombre de la postulación ligada (sale del tablero, que ya está cargado). */
  protected postulacion(id: string): string {
    const p = this.tablero.buscar(id);
    return p ? `${p.empresa} · ${p.titulo}` : '…';
  }

  protected async nuevo(): Promise<void> {
    const r = await this.dialogos.abrir<ContactoRedEntrada, object>(DialogoNuevoContacto, {});
    if (!r) return;
    const x = await this.store.registrar(r);
    if (!x.ok) {
      this.avisos.error(x.error);
      return;
    }
    this.avisos.exito(x.valor.nuevo === false ? 'red.nuevo.actualizado' : 'red.nuevo.creado', {
      nombre: x.valor.nombre,
    });
    void this.router.navigate(['/red', x.valor.id]);
  }
}
