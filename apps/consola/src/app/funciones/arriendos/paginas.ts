import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import {
  ApiArriendos,
  type Busqueda,
  type CriterioDeBusqueda,
  type ReglaEntrada,
} from '../../nucleo/api/arriendos.api';
import { Avisos } from '../../nucleo/avisos';
import { ArriendosStore } from './arriendos.store';
import { CalceArriendo, precioTexto } from './piezas';

/** Lista de propiedades: todo en una tabla para comparar precio, calce y lo pendiente. */
@Component({
  selector: 'b-arriendos-lista',
  imports: [RouterLink, TranslocoPipe, CalceArriendo],
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
                <a [routerLink]="['/arriendos/propiedades', p.id]" class="font-semibold">{{
                  p.titulo
                }}</a>
                @if (p.pendiente === 'responder') {
                  <span class="ml-1 text-[12px] font-semibold text-acento"
                    >· {{ 'arriendos.teTocaResponder' | transloco }}</span
                  >
                }
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

interface ReglaEditable {
  criterio: CriterioDeBusqueda;
  valor: string;
  dura: boolean;
  prioridad: number;
}

const SIN_VALOR: CriterioDeBusqueda[] = ['renta_exigida', 'aval'];
const SI_NO: CriterioDeBusqueda[] = ['mascota', 'estacionamiento', 'amoblado'];
const LISTA: CriterioDeBusqueda[] = ['comuna', 'tipo'];

/** Tu búsqueda (P4 y P7): reglas duras y blandas con prioridad, tus datos y el historial de cambios. */
@Component({
  selector: 'b-arriendos-busqueda',
  imports: [FormsModule, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex max-w-[920px] flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <h1 class="titulo-pagina m-0">{{ 'arriendos.tuBusqueda' | transloco }}</h1>
    <p class="m-0 text-tinta-suave">{{ 'arriendos.busquedaAyuda' | transloco }}</p>
    @if (b(); as b) {
      <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); guardar()">
        <fieldset class="m-0 flex flex-col gap-2 rounded-[12px] border border-linea p-4">
          <legend class="px-1 font-bold">{{ 'arriendos.reglas' | transloco }}</legend>
          @for (r of reglas(); track $index; let i = $index) {
            <div
              class="grid grid-cols-[1fr_1fr_120px_90px_auto] items-end gap-2"
              [attr.data-regla]="r.criterio"
            >
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.criterio' | transloco }}</span>
                <select hlmInput [name]="'c' + i" [(ngModel)]="r.criterio">
                  @for (c of criterios; track c) {
                    <option [value]="c">{{ 'criterios.' + c | transloco }}</option>
                  }
                </select>
              </label>
              <div class="flex flex-col gap-1">
                <span class="text-[12.5px]" [id]="'valor-' + i">{{
                  ayudaValor(r.criterio) | transloco
                }}</span>
                @if (sinValor(r.criterio)) {
                  <input
                    hlmInput
                    [name]="'v' + i"
                    disabled
                    value="—"
                    [attr.aria-labelledby]="'valor-' + i"
                  />
                } @else if (siNo(r.criterio)) {
                  <select
                    hlmInput
                    [name]="'v' + i"
                    [(ngModel)]="r.valor"
                    [attr.aria-labelledby]="'valor-' + i"
                  >
                    <option value="si">{{ 'arriendos.si' | transloco }}</option>
                    <option value="no">{{ 'arriendos.no' | transloco }}</option>
                  </select>
                } @else {
                  <input
                    hlmInput
                    [name]="'v' + i"
                    [(ngModel)]="r.valor"
                    [attr.aria-labelledby]="'valor-' + i"
                    [type]="r.criterio === 'disponible_desde' ? 'date' : 'text'"
                  />
                }
              </div>
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.tipoRegla' | transloco }}</span>
                <select hlmInput [name]="'d' + i" [(ngModel)]="r.dura">
                  <option [ngValue]="true">{{ 'arriendos.dura' | transloco }}</option>
                  <option [ngValue]="false">{{ 'arriendos.blanda' | transloco }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[12.5px]">{{ 'arriendos.prioridad' | transloco }}</span>
                <input
                  hlmInput
                  type="number"
                  min="1"
                  [name]="'p' + i"
                  [(ngModel)]="r.prioridad"
                  [disabled]="r.dura"
                />
              </label>
              <button
                hlmBtn
                variant="ghost"
                size="sm"
                type="button"
                (click)="quitar(i)"
                [attr.aria-label]="'arriendos.quitarRegla' | transloco"
              >
                ✕
              </button>
            </div>
          }
          <div class="flex flex-wrap gap-2">
            <button hlmBtn variant="outline" size="sm" type="button" (click)="agregar()">
              + {{ 'arriendos.agregarRegla' | transloco }}
            </button>
            @for (c of b.criteriosSugeridos; track c) {
              <button hlmBtn variant="ghost" size="sm" type="button" (click)="agregar(c)">
                + {{ 'criterios.' + c | transloco }}
              </button>
            }
          </div>
        </fieldset>
        <fieldset
          class="m-0 grid grid-cols-1 gap-3 rounded-[12px] border border-linea p-4 md:grid-cols-3"
        >
          <legend class="px-1 font-bold">{{ 'arriendos.tusDatos' | transloco }}</legend>
          <label class="flex flex-col gap-1">
            <span class="text-[12.5px]">{{ 'arriendos.rentaLiquida' | transloco }}</span>
            <input hlmInput type="number" min="0" name="renta" [(ngModel)]="persona.rentaLiquida" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[12.5px]">{{ 'arriendos.tienesAval' | transloco }}</span>
            <select hlmInput name="aval" [(ngModel)]="persona.tieneAval">
              <option value="">—</option>
              <option value="si">{{ 'arriendos.si' | transloco }}</option>
              <option value="no">{{ 'arriendos.no' | transloco }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 md:col-span-3">
            <input type="checkbox" name="geo" [(ngModel)]="geocodificar" data-geocodificar />
            <span class="text-[13px]">{{ 'arriendos.geocodificar' | transloco }}</span>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[12.5px]">{{ 'arriendos.uf' | transloco }}</span>
            <input hlmInput type="number" min="0" step="0.01" name="uf" [(ngModel)]="uf" />
          </label>
        </fieldset>
        <div class="flex flex-wrap items-end gap-2">
          <label class="flex min-w-[260px] flex-1 flex-col gap-1">
            <span class="font-semibold">{{ 'arriendos.motivoCambio' | transloco }}</span>
            <input
              hlmInput
              name="motivo"
              [(ngModel)]="motivo"
              [placeholder]="'arriendos.motivoEjemplo' | transloco"
              data-motivo-busqueda
            />
          </label>
          <button hlmBtn type="submit" [disabled]="!motivo.trim()">
            {{ 'arriendos.guardar' | transloco }}
          </button>
        </div>
      </form>
      <section class="flex flex-col gap-2" aria-labelledby="t-hist">
        <h2 id="t-hist" class="m-0 text-base font-bold">{{ 'arriendos.historial' | transloco }}</h2>
        @for (h of b.historial; track $index) {
          <div class="rounded-[10px] bg-superficie px-3 py-2 text-[13px]">
            <span class="text-tinta-suave"
              >{{ fecha(h.ocurridoEn) }} · {{ 'origenesArriendo.' + h.origen | transloco }} ·
            </span>
            <strong>{{ h.motivo }}</strong>
            <span class="block text-tinta-suave">{{ h.resumen.join(' · ') }}</span>
          </div>
        } @empty {
          <p class="m-0 text-tinta-suave">{{ 'arriendos.sinHistorial' | transloco }}</p>
        }
      </section>
    }
  `,
})
export class ArriendosBusquedaPagina {
  private readonly api = inject(ApiArriendos);
  private readonly avisos = inject(Avisos);
  private readonly store = inject(ArriendosStore);
  protected readonly b = signal<Busqueda | null>(null);
  protected readonly reglas = signal<ReglaEditable[]>([]);
  protected readonly criterios: CriterioDeBusqueda[] = [
    'presupuesto_total',
    'gastos_comunes',
    'comuna',
    'tipo',
    'dormitorios',
    'banos',
    'm2',
    'mascota',
    'estacionamiento',
    'amoblado',
    'renta_exigida',
    'aval',
    'disponible_desde',
  ];
  protected persona = { rentaLiquida: null as number | null, tieneAval: '' };
  protected uf: number | null = null;
  protected geocodificar = true;
  protected motivo = '';
  protected readonly sinValor = (c: CriterioDeBusqueda) => SIN_VALOR.includes(c);
  protected readonly siNo = (c: CriterioDeBusqueda) => SI_NO.includes(c);
  protected readonly ayudaValor = (c: CriterioDeBusqueda) =>
    LISTA.includes(c) ? 'arriendos.valorLista' : 'arriendos.valor';

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    const b = await firstValueFrom(this.api.busqueda());
    this.b.set(b);
    // Transitorio hasta la página Perfil (perfil.md §5): las reglas sin criterio no se editan aquí.
    this.reglas.set(
      b.reglas.flatMap((r) => (r.criterio ? [{ ...r, criterio: r.criterio }] : [])).map((r) => ({
        criterio: r.criterio,
        valor: Array.isArray(r.valor)
          ? r.valor.join(', ')
          : typeof r.valor === 'boolean'
            ? r.valor
              ? 'si'
              : 'no'
            : String(r.valor ?? ''),
        dura: r.dura,
        prioridad: r.prioridad ?? 1,
      })),
    );
    this.persona = {
      rentaLiquida: b.persona.rentaLiquida ?? null,
      tieneAval: b.persona.tieneAval === undefined ? '' : b.persona.tieneAval ? 'si' : 'no',
    };
    this.uf = b.uf?.valor ?? null;
    this.geocodificar = b.geocodificar;
  }

  protected agregar(c: CriterioDeBusqueda = 'presupuesto_total'): void {
    this.reglas.update((rs) => [
      ...rs,
      { criterio: c, valor: SI_NO.includes(c) ? 'si' : '', dura: true, prioridad: 1 },
    ]);
    this.b.update(
      (b) => b && { ...b, criteriosSugeridos: b.criteriosSugeridos.filter((x) => x !== c) },
    );
  }

  protected quitar(i: number): void {
    this.reglas.update((rs) => rs.filter((_, j) => j !== i));
  }

  private aEntrada(r: ReglaEditable): ReglaEntrada {
    const base = {
      criterio: r.criterio,
      dura: r.dura,
      ...(r.dura ? {} : { prioridad: Number(r.prioridad) || 1 }),
    };
    if (SIN_VALOR.includes(r.criterio)) return base;
    if (SI_NO.includes(r.criterio)) return { ...base, valor: r.valor === 'si' };
    if (LISTA.includes(r.criterio))
      return {
        ...base,
        valor: r.valor
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      };
    if (r.criterio === 'disponible_desde') return { ...base, valor: r.valor };
    return {
      ...base,
      valor: Number(
        String(r.valor)
          .replace(/[.$\s]/g, '')
          .replace(',', '.'),
      ),
    };
  }

  protected async guardar(): Promise<void> {
    try {
      if (this.geocodificar !== this.b()?.geocodificar)
        await firstValueFrom(this.api.fijarGeocodificar(this.geocodificar));
      if (this.uf && this.uf !== this.b()?.uf?.valor)
        await firstValueFrom(
          this.api.fijarUf(Number(this.uf), new Date().toISOString().slice(0, 10)),
        );
      const b = await firstValueFrom(
        this.api.cambiarBusqueda({
          reglas: this.reglas().map((r) => this.aEntrada(r)),
          persona: {
            rentaLiquida:
              this.persona.rentaLiquida === null || (this.persona.rentaLiquida as unknown) === ''
                ? null
                : Number(this.persona.rentaLiquida),
            tieneAval: this.persona.tieneAval === '' ? null : this.persona.tieneAval === 'si',
          },
          motivo: this.motivo.trim(),
        }),
      );
      this.b.set(b);
      this.motivo = '';
      this.avisos.exito('arriendos.guardado');
      void this.store.cargar(true);
      await this.cargar();
    } catch (e) {
      this.avisos.error(e);
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
}
