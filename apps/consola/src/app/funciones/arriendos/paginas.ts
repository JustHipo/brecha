import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { ApiArriendos } from '../../nucleo/api/arriendos.api';
import { Avisos } from '../../nucleo/avisos';
import { ArriendosStore } from './arriendos.store';
import { FotoGuardada } from './fotos';
import { CalceArriendo, precioTexto } from './piezas';

/** Lista de propiedades: todo en una tabla para comparar precio, calce y lo pendiente. */
@Component({
  selector: 'b-arriendos-lista',
  imports: [RouterLink, TranslocoPipe, CalceArriendo, FotoGuardada],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <h1 class="titulo-pagina m-0 flex-1">{{ 'nav.lista' | transloco }}</h1>
      <label
        class="flex h-[34px] items-center gap-2 rounded-full border border-linea bg-fondo px-3"
      >
        <span class="solo-lector">{{ 'arriendos.filtrar' | transloco }}</span>
        <input
          class="w-48 bg-transparent outline-none"
          [placeholder]="'arriendos.filtrar' | transloco"
          [value]="store.texto()"
          (input)="store.texto.set($any($event.target).value)"
        />
      </label>
    </div>
    <div class="overflow-x-auto rounded-[12px] border border-linea">
      <table class="w-full min-w-[860px] border-collapse text-left">
        <thead class="bg-superficie text-[12.5px] text-tinta-suave">
          <tr>
            <th class="px-3 py-2">{{ 'arriendos.propiedad' | transloco }}</th>
            <th class="px-3 py-2">{{ 'arriendos.estado' | transloco }}</th>
            <th class="px-3 py-2">{{ 'arriendos.campos.precio' | transloco }}</th>
            <th class="px-3 py-2">{{ 'arriendos.campos.gastosComunes' | transloco }}</th>
            <th class="px-3 py-2">{{ 'arriendos.calceTitulo' | transloco }}</th>
            <th class="px-3 py-2">{{ 'arriendos.brecha' | transloco }}</th>
            <th class="px-3 py-2">{{ 'arriendos.canales' | transloco }}</th>
          </tr>
        </thead>
        <tbody>
          @for (p of store.filtradas(); track p.id) {
            <tr class="border-t border-linea">
              <td class="px-3 py-2">
                <div class="flex items-center gap-2.5">
                  @if (p.portada) {
                    <b-foto
                      class="h-10 w-14 shrink-0 rounded-[6px]"
                      [fotoId]="p.portada"
                      alt=""
                      data-portada
                    />
                  }
                  <div>
                    <a [routerLink]="['/arriendos/propiedades', p.id]" class="font-semibold">{{
                      p.titulo
                    }}</a>
                    @if (p.pendiente === 'responder') {
                      <span class="ml-1 text-[12px] font-semibold text-acento"
                        >· {{ 'arriendos.teTocaResponder' | transloco }}</span
                      >
                    }
                  </div>
                </div>
              </td>
              <td class="px-3 py-2">{{ 'estadosArriendo.' + p.estado | transloco }}</td>
              <td class="px-3 py-2 tabular-nums">{{ precio(p) }}</td>
              <td class="px-3 py-2 tabular-nums">{{ p.gastosComunes ?? '—' }}</td>
              <td class="px-3 py-2"><b-calce-arriendo [calce]="p.calce" /></td>
              <td class="px-3 py-2 text-[13px]">{{ p.calce.brechas[0]?.texto ?? '' }}</td>
              <td class="px-3 py-2 text-[13px]">
                @for (c of p.canales; track c; let ultimo = $last) {
                  {{ store.nombreCanal()(c) }}
                  @if (!ultimo) {
                    ,
                  }
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="7" class="px-3 py-6 text-center text-tinta-suave">
                {{ 'arriendos.vacioTitulo' | transloco }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ArriendosListaPagina {
  protected readonly store = inject(ArriendosStore);
  protected readonly precio = precioTexto;
  constructor() {
    if (this.store.estado() !== 'cargando') void this.store.cargar(this.store.estado() === 'listo');
  }
}

/** Bandeja de Arriendos: señales que llegaron sin saber de qué propiedad son. */
@Component({
  selector: 'b-arriendos-bandeja',
  imports: [FormsModule, RouterLink, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <h1 class="titulo-pagina m-0">{{ 'nav.bandeja' | transloco }}</h1>
    <p class="m-0 text-tinta-suave">{{ 'arriendos.bandejaAyuda' | transloco }}</p>
    @for (s of store.bandeja(); track s.id) {
      <article
        class="flex flex-col gap-2 rounded-[12px] border border-linea p-4"
        [attr.data-senal]="s.id"
      >
        <div class="flex flex-wrap gap-2 text-[13px] text-tinta-suave">
          <span>{{ fecha(s.recibidaEn) }}</span>
          <span>· {{ 'fuentesArriendo.' + s.fuente | transloco }}</span>
          @if (s.remitente) {
            <span>· {{ s.remitente }}</span>
          }
          @if (s.asunto) {
            <span>· «{{ s.asunto }}»</span>
          }
        </div>
        <p class="m-0">{{ s.resumen }}</p>
        <p class="m-0 text-[13px] text-tinta-suave">
          @if (s.direccionDetectada) {
            {{ s.direccionDetectada }}
          }
          @if (s.comunaDetectada) {
            · {{ s.comunaDetectada }}
          }
          @if (s.contactoDetectado?.nombre) {
            · {{ s.contactoDetectado?.nombre }}
          }
          @if (s.urlDetectada) {
            ·
            <a [href]="s.urlDetectada" target="_blank" rel="noopener noreferrer"
              >{{ 'arriendos.verAviso' | transloco }} ↗</a
            >
          }
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-[12.5px]">{{ 'arriendos.asociarA' | transloco }}</span>
            <select hlmInput [name]="'prop-' + s.id" [(ngModel)]="eleccion[s.id]">
              <option value="">—</option>
              @for (p of store.todas(); track p.id) {
                <option [value]="p.id">{{ p.titulo }}</option>
              }
            </select>
          </label>
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            [disabled]="!eleccion[s.id]"
            (click)="asociar(s.id)"
          >
            {{ 'arriendos.asociar' | transloco }}
          </button>
          <a hlmBtn variant="ghost" size="sm" routerLink="/arriendos/propiedades/nueva">{{
            'arriendos.nueva' | transloco
          }}</a>
          <button hlmBtn variant="ghost" size="sm" type="button" (click)="descartar(s.id)">
            {{ 'arriendos.descartar' | transloco }}
          </button>
        </div>
      </article>
    } @empty {
      <p
        class="m-0 rounded-[12px] border border-dashed border-linea bg-superficie p-6 text-center text-tinta-suave"
      >
        {{ 'arriendos.bandejaVacia' | transloco }}
      </p>
    }
  `,
})
export class ArriendosBandejaPagina {
  protected readonly store = inject(ArriendosStore);
  private readonly api = inject(ApiArriendos);
  private readonly avisos = inject(Avisos);
  protected eleccion: Record<string, string> = {};
  constructor() {
    void this.store.cargar(this.store.estado() === 'listo');
  }
  protected fecha(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  protected async asociar(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.asociar(id, this.eleccion[id]!));
      this.avisos.exito('arriendos.asociada');
      await this.store.cargar(true);
    } catch (e) {
      this.avisos.error(e);
    }
  }
  protected async descartar(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.descartar(id));
      await this.store.cargar(true);
    } catch (e) {
      this.avisos.error(e);
    }
  }
}

/** Canales (P3): portales, mensajería, correo, teléfono y corredoras; agregas los que falten. */
@Component({
  selector: 'b-arriendos-canales',
  imports: [FormsModule, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex max-w-[880px] flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <h1 class="titulo-pagina m-0">{{ 'nav.canales' | transloco }}</h1>
    <p class="m-0 text-tinta-suave">{{ 'arriendos.canalesAyuda' | transloco }}</p>
    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      @for (c of store.canales(); track c.id) {
        <li
          class="flex flex-wrap items-center gap-3 rounded-[10px] border border-linea px-3 py-2"
          [class.opacity-60]="!c.activo"
        >
          <strong class="min-w-40">{{ c.nombre }}</strong>
          <span class="text-tinta-suave">{{ 'tiposCanal.' + c.tipo | transloco }}</span>
          <span class="flex-1 text-[13px] text-tinta-suave">{{ c.dominios.join(', ') }}</span>
          <code class="text-[12px] text-tinta-suave">{{ c.id }}</code>
          <button
            hlmBtn
            variant="ghost"
            size="xs"
            type="button"
            (click)="alternar(c.id, !c.activo)"
          >
            {{ (c.activo ? 'arriendos.desactivar' : 'arriendos.activar') | transloco }}
          </button>
        </li>
      }
    </ul>
    <form
      class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_1fr_auto] md:items-end"
      (submit)="$event.preventDefault(); crear()"
    >
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.nombre' | transloco }}</span>
        <input hlmInput name="nombre" [(ngModel)]="nuevo.nombre" data-canal-nombre />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.tipo' | transloco }}</span>
        <select hlmInput name="tipo" [(ngModel)]="nuevo.tipo">
          @for (t of tipos; track t) {
            <option [value]="t">{{ 'tiposCanal.' + t | transloco }}</option>
          }
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'arriendos.dominios' | transloco }}</span>
        <input hlmInput name="dominios" [(ngModel)]="nuevo.dominios" placeholder="micorredora.cl" />
      </label>
      <button hlmBtn type="submit" [disabled]="!nuevo.nombre.trim()">
        {{ 'arriendos.agregar' | transloco }}
      </button>
    </form>
  `,
})
export class ArriendosCanalesPagina {
  protected readonly store = inject(ArriendosStore);
  private readonly api = inject(ApiArriendos);
  private readonly avisos = inject(Avisos);
  protected readonly tipos = [
    'portal',
    'mensajeria',
    'correo',
    'telefono',
    'corredora',
    'otro',
  ] as const;
  protected nuevo = { nombre: '', tipo: 'portal', dominios: '' };
  constructor() {
    void this.store.cargar(this.store.estado() === 'listo');
  }
  protected async crear(): Promise<void> {
    const dominios = this.nuevo.dominios.split(/[,\s]+/).filter(Boolean);
    try {
      await firstValueFrom(
        this.api.registrarCanal({
          nombre: this.nuevo.nombre.trim(),
          tipo: this.nuevo.tipo as never,
          dominios,
        }),
      );
      this.nuevo = { nombre: '', tipo: 'portal', dominios: '' };
      await this.store.cargar(true);
    } catch (e) {
      this.avisos.error(e);
    }
  }
  protected async alternar(id: string, activo: boolean): Promise<void> {
    try {
      await firstValueFrom(this.api.editarCanal(id, { activo }));
      await this.store.cargar(true);
    } catch (e) {
      this.avisos.error(e);
    }
  }
}
