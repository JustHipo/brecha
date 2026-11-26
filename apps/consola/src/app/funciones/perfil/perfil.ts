import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { ApiArriendos } from '../../nucleo/api/arriendos.api';
import { ApiPerfil } from '../../nucleo/api/perfil.api';
import { Avisos } from '../../nucleo/avisos';
import { ArriendosStore } from '../arriendos/arriendos.store';
import { TableroStore } from '../tablero/tablero.store';
import {
  aEditables,
  aEntradas,
  agrupar,
  claveNueva,
  etiquetasEnUso,
  FECHA,
  fijarDura,
  LISTA,
  MODALIDADES,
  moverBlanda,
  normalizarEtiqueta,
  PLATAFORMAS,
  prioridades,
  SI_NO,
  SIN_VALOR,
  valorVacio,
  ZONAS,
  type FocoDePerfil,
  type ModalidadAceptada,
  type ReglaEditable,
  type Zona,
} from './reglas';

interface Historial {
  ocurridoEn: string;
  origen: string;
  motivo: string;
  resumen: string[];
}

/**
 * Perfil de búsqueda de un foco (docs/diseno/perfil.md §5): reglas duras y blandas con etiquetas, agrupadas y
 * filtrables por etiqueta, con flechas para la prioridad de las blandas. Cada guardado pide un motivo.
 */
@Component({
  selector: 'b-perfil',
  imports: [FormsModule, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex max-w-[960px] flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <h1 class="titulo-pagina m-0">{{ 'perfil.titulo' | transloco }}</h1>
    <p class="m-0 max-w-[70ch] text-tinta-suave">{{ 'perfil.ayuda.' + foco | transloco }}</p>
    @if (cargado()) {
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); guardar()">
        <div
          class="flex flex-wrap items-center gap-2"
          role="group"
          [attr.aria-label]="'perfil.filtrar' | transloco"
          data-filtro-etiquetas
        >
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px]"
            [class.border-tinta]="filtro() === null"
            [class.bg-tinta]="filtro() === null"
            [class.text-white]="filtro() === null"
            [class.border-linea]="filtro() !== null"
            [class.bg-fondo]="filtro() !== null"
            [attr.aria-pressed]="filtro() === null"
            (click)="filtro.set(null)"
          >
            {{ 'perfil.todas' | transloco }}
            <span class="text-xs font-semibold tabular-nums">{{ reglas().length }}</span>
          </button>
          @for (e of etiquetas(); track e.etiqueta) {
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px]"
              [class.border-tinta]="filtro() === e.etiqueta"
              [class.bg-tinta]="filtro() === e.etiqueta"
              [class.text-white]="filtro() === e.etiqueta"
              [class.border-linea]="filtro() !== e.etiqueta"
              [class.bg-fondo]="filtro() !== e.etiqueta"
              [attr.aria-pressed]="filtro() === e.etiqueta"
              (click)="filtro.set(filtro() === e.etiqueta ? null : e.etiqueta)"
            >
              #{{ e.etiqueta }}
              <span class="text-xs font-semibold tabular-nums">{{ e.total }}</span>
            </button>
          }
        </div>

        @for (g of grupos(); track g.etiqueta) {
          <section class="flex flex-col gap-2" [attr.data-grupo]="g.etiqueta ?? ''">
            <h2
              class="m-0 text-[12.5px] font-semibold tracking-[0.04em] text-tinta-suave uppercase"
            >
              {{ g.etiqueta ? '#' + g.etiqueta : ('perfil.sinEtiqueta' | transloco) }}
            </h2>
            @for (r of g.reglas; track r.clave) {
              <article
                class="flex flex-col gap-2.5 rounded-[12px] border border-linea bg-fondo p-3"
                [attr.data-regla]="r.texto"
              >
                <div class="flex flex-wrap items-end gap-2">
                  <span
                    class="mb-2 inline-flex min-w-[52px] justify-center rounded-full border border-linea px-2 py-0.5 text-[12px] font-bold"
                    [class.text-brecha]="r.dura"
                    [class.text-acento]="!r.dura"
                    data-tipo-regla
                    >{{ r.dura ? ('perfil.dura' | transloco) : 'P' + prioridad(r) }}</span
                  >
                  <label class="flex min-w-[240px] flex-1 flex-col gap-1">
                    <span class="text-[12.5px]">{{ 'perfil.regla' | transloco }}</span>
                    <textarea
                      hlmInput
                      rows="1"
                      class="min-h-9 resize-none [field-sizing:content]"
                      [name]="'t-' + r.clave"
                      [(ngModel)]="r.texto"
                      [placeholder]="'perfil.reglaEjemplo.' + foco | transloco"
                      maxlength="500"
                    ></textarea>
                  </label>
                  <label class="flex flex-col gap-1">
                    <span class="text-[12.5px]">{{ 'perfil.tipo' | transloco }}</span>
                    <select
                      hlmInput
                      [name]="'d-' + r.clave"
                      [ngModel]="r.dura"
                      (ngModelChange)="cambiarDura(r, $event)"
                    >
                      <option [ngValue]="true">{{ 'perfil.dura' | transloco }}</option>
                      <option [ngValue]="false">{{ 'perfil.blanda' | transloco }}</option>
                    </select>
                  </label>
                  @if (!r.dura) {
                    <button
                      hlmBtn
                      variant="outline"
                      size="sm"
                      type="button"
                      class="mb-0.5"
                      [disabled]="prioridad(r) === 1"
                      [attr.aria-label]="'perfil.subir' | transloco: { regla: r.texto }"
                      (click)="mover(r, -1)"
                    >
                      ↑
                    </button>
                    <button
                      hlmBtn
                      variant="outline"
                      size="sm"
                      type="button"
                      class="mb-0.5"
                      [disabled]="prioridad(r) === totalBlandas()"
                      [attr.aria-label]="'perfil.bajar' | transloco: { regla: r.texto }"
                      (click)="mover(r, 1)"
                    >
                      ↓
                    </button>
                  }
                  <button
                    hlmBtn
                    variant="ghost"
                    size="sm"
                    type="button"
                    class="mb-0.5"
                    [attr.aria-label]="'perfil.quitar' | transloco: { regla: r.texto }"
                    (click)="quitar(r)"
                  >
                    ✕
                  </button>
                </div>

                <div class="flex flex-wrap items-center gap-1.5" data-etiquetas-regla>
                  @for (e of r.etiquetas; track e) {
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-superficie py-0.5 pr-1 pl-2.5 text-[12.5px]"
                      >#{{ e }}
                      <button
                        type="button"
                        class="rounded-full px-1 text-tinta-suave hover:text-tinta"
                        [attr.aria-label]="'perfil.quitarEtiqueta' | transloco: { etiqueta: e }"
                        (click)="quitarEtiqueta(r, e)"
                      >
                        ✕
                      </button>
                    </span>
                  }
                  <input
                    hlmInput
                    class="h-7 w-36 text-[12.5px]"
                    [name]="'e-' + r.clave"
                    [placeholder]="'perfil.nuevaEtiqueta' | transloco"
                    [attr.aria-label]="'perfil.agregarEtiqueta' | transloco: { regla: r.texto }"
                    (keydown.enter)="$event.preventDefault(); agregarEtiqueta(r, $event)"
                    (blur)="agregarEtiqueta(r, $event)"
                  />
                </div>

                <div class="flex flex-wrap items-end gap-2">
                  <label class="flex flex-col gap-1">
                    <span class="text-[12.5px]">{{ 'perfil.chequeo' | transloco }}</span>
                    <select
                      hlmInput
                      [name]="'c-' + r.clave"
                      [ngModel]="r.criterio"
                      (ngModelChange)="cambiarCriterio(r, $event)"
                    >
                      <option value="">{{ 'perfil.sinChequeo' | transloco }}</option>
                      @for (c of criterios(); track c) {
                        <option [value]="c">{{ nombreCriterio(c) | transloco }}</option>
                      }
                    </select>
                  </label>
                  @if (r.criterio) {
                    @if (foco === 'empleo') {
                      @switch (r.criterio) {
                        @case ('titulo') {
                          <label class="flex min-w-[200px] flex-1 flex-col gap-1">
                            <span class="text-[12.5px]">{{ 'perfil.incluir' | transloco }}</span>
                            <input
                              hlmInput
                              [name]="'vi-' + r.clave"
                              [(ngModel)]="r.valor.incluir"
                            />
                          </label>
                          <label class="flex min-w-[200px] flex-1 flex-col gap-1">
                            <span class="text-[12.5px]">{{ 'perfil.excluir' | transloco }}</span>
                            <input
                              hlmInput
                              [name]="'ve-' + r.clave"
                              [(ngModel)]="r.valor.excluir"
                            />
                          </label>
                        }
                        @case ('modalidad_por_region') {
                          <div class="flex w-full flex-col gap-1.5" data-modalidad-por-region>
                            @for (z of zonas; track z) {
                              <fieldset class="m-0 flex flex-wrap items-center gap-3 border-0 p-0">
                                <legend class="float-left mr-2 w-44 p-0 text-[13px] font-semibold">
                                  {{ 'perfil.zonas.' + z | transloco }}
                                </legend>
                                @for (m of modalidades; track m) {
                                  <label class="flex items-center gap-1.5 text-[13px]">
                                    <input
                                      type="checkbox"
                                      [name]="'z-' + r.clave + z + m"
                                      [ngModel]="r.valor.zonas[z].includes(m)"
                                      (ngModelChange)="alternarModalidad(r, z, m, $event)"
                                    />
                                    {{ 'modalidades.' + m | transloco }}
                                  </label>
                                }
                              </fieldset>
                            }
                            <fieldset class="m-0 flex flex-wrap items-center gap-3 border-0 p-0">
                              <legend class="float-left mr-2 p-0 text-[13px]">
                                {{ 'perfil.noIndica' | transloco }}
                              </legend>
                              @for (p of plataformas; track p) {
                                <label class="flex items-center gap-1.5 text-[13px]">
                                  <input
                                    type="checkbox"
                                    [name]="'n-' + r.clave + p"
                                    [ngModel]="r.valor.noIndica.includes(p)"
                                    (ngModelChange)="alternarPlataforma(r, p, $event)"
                                  />
                                  {{ 'plataformas.' + p | transloco }}
                                </label>
                              }
                            </fieldset>
                          </div>
                        }
                        @default {
                          <label class="flex flex-col gap-1">
                            <span class="text-[12.5px]">{{ 'perfil.minimo' | transloco }}</span>
                            <input
                              hlmInput
                              inputmode="numeric"
                              [name]="'vm-' + r.clave"
                              [(ngModel)]="r.valor.minimo"
                            />
                          </label>
                        }
                      }
                    } @else if (sinValor(r.criterio)) {
                      <span class="mb-2 text-[13px] text-tinta-suave">{{
                        'perfil.usaTusDatos' | transloco
                      }}</span>
                    } @else if (siNo(r.criterio)) {
                      <label class="flex flex-col gap-1">
                        <span class="text-[12.5px]">{{ 'perfil.valor' | transloco }}</span>
                        <select hlmInput [name]="'vs-' + r.clave" [(ngModel)]="r.valor.texto">
                          <option value="si">{{ 'arriendos.si' | transloco }}</option>
                          <option value="no">{{ 'arriendos.no' | transloco }}</option>
                        </select>
                      </label>
                    } @else {
                      <label class="flex min-w-[200px] flex-col gap-1">
                        <span class="text-[12.5px]">{{
                          (lista(r.criterio) ? 'arriendos.valorLista' : 'perfil.valor') | transloco
                        }}</span>
                        <input
                          hlmInput
                          [name]="'vt-' + r.clave"
                          [type]="fecha(r.criterio) ? 'date' : 'text'"
                          [(ngModel)]="r.valor.texto"
                        />
                      </label>
                    }
                  }
                </div>
              </article>
            }
          </section>
        } @empty {
          <p class="m-0 text-tinta-suave">{{ 'perfil.sinReglas' | transloco }}</p>
        }

        <div class="flex flex-wrap gap-2">
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            (click)="agregar()"
            data-agregar-regla
          >
            + {{ 'perfil.agregar' | transloco }}
          </button>
          @for (c of sugeridos(); track c) {
            <button hlmBtn variant="ghost" size="sm" type="button" (click)="agregar(c)">
              + {{ nombreCriterio(c) | transloco }}
            </button>
          }
        </div>

        <fieldset
          class="m-0 grid grid-cols-1 gap-3 rounded-[12px] border border-linea p-4 md:grid-cols-3"
        >
          <legend class="px-1 font-bold">{{ 'perfil.tusDatos' | transloco }}</legend>
          @if (foco === 'empleo') {
            <label class="flex flex-col gap-1">
              <span class="text-[12.5px]">{{ 'perfil.rentaPretendida' | transloco }}</span>
              <input
                hlmInput
                inputmode="numeric"
                name="renta"
                [(ngModel)]="empleo.rentaPretendida"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-[12.5px]">{{ 'perfil.disponibleDesde' | transloco }}</span>
              <input hlmInput type="date" name="disponible" [(ngModel)]="empleo.disponibleDesde" />
            </label>
            <label class="flex flex-col gap-1 md:col-span-3">
              <span class="text-[12.5px]">{{ 'perfil.notas' | transloco }}</span>
              <textarea hlmInput rows="2" name="notas" [(ngModel)]="empleo.notas"></textarea>
            </label>
          } @else {
            <label class="flex flex-col gap-1">
              <span class="text-[12.5px]">{{ 'arriendos.rentaLiquida' | transloco }}</span>
              <input
                hlmInput
                inputmode="numeric"
                name="renta"
                [(ngModel)]="arriendo.rentaLiquida"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-[12.5px]">{{ 'arriendos.tienesAval' | transloco }}</span>
              <select hlmInput name="aval" [(ngModel)]="arriendo.tieneAval">
                <option value="">—</option>
                <option value="si">{{ 'arriendos.si' | transloco }}</option>
                <option value="no">{{ 'arriendos.no' | transloco }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-[12.5px]">{{ 'arriendos.uf' | transloco }}</span>
              <input
                hlmInput
                type="number"
                min="0"
                step="0.01"
                name="uf"
                [(ngModel)]="arriendo.uf"
              />
            </label>
            <label class="flex items-center gap-2 md:col-span-3">
              <input
                type="checkbox"
                name="geo"
                [(ngModel)]="arriendo.geocodificar"
                data-geocodificar
              />
              <span class="text-[13px]">{{ 'arriendos.geocodificar' | transloco }}</span>
            </label>
          }
        </fieldset>

        <div class="flex flex-wrap items-end gap-2">
          <label class="flex min-w-[260px] flex-1 flex-col gap-1">
            <span class="font-semibold">{{ 'perfil.motivo' | transloco }}</span>
            <input
              hlmInput
              name="motivo"
              [(ngModel)]="motivo"
              [placeholder]="'perfil.motivoEjemplo.' + foco | transloco"
              data-motivo-perfil
            />
          </label>
          <button hlmBtn type="submit" [disabled]="!motivo.trim() || guardando()">
            {{ 'perfil.guardar' | transloco }}
          </button>
        </div>
      </form>

      <section class="flex flex-col gap-2" aria-labelledby="t-hist-perfil">
        <h2 id="t-hist-perfil" class="m-0 text-base font-bold">
          {{ 'perfil.historial' | transloco }}
        </h2>
        @for (h of historial(); track $index) {
          <div class="rounded-[10px] bg-superficie px-3 py-2 text-[13px]">
            <span class="text-tinta-suave"
              >{{ fechaCorta(h.ocurridoEn) }} · {{ 'perfil.origenes.' + h.origen | transloco }} ·
            </span>
            <strong>{{ h.motivo }}</strong>
            <span class="block text-tinta-suave">{{ h.resumen.join(' · ') }}</span>
          </div>
        } @empty {
          <p class="m-0 text-tinta-suave">{{ 'perfil.sinHistorial' | transloco }}</p>
        }
      </section>
    }
  `,
})
export class PerfilPagina {
  private readonly ruta = inject(ActivatedRoute);
  private readonly apiPerfil = inject(ApiPerfil);
  private readonly apiArriendos = inject(ApiArriendos);
  private readonly avisos = inject(Avisos);
  private readonly arriendos = inject(ArriendosStore);
  private readonly tablero = inject(TableroStore);

  protected readonly foco: FocoDePerfil =
    this.ruta.snapshot.data['foco'] === 'arriendos' ? 'arriendos' : 'empleo';
  protected readonly zonas = ZONAS;
  protected readonly modalidades = MODALIDADES;
  protected readonly plataformas = PLATAFORMAS;

  protected readonly cargado = signal(false);
  protected readonly guardando = signal(false);
  protected readonly reglas = signal<ReglaEditable[]>([]);
  protected readonly filtro = signal<string | null>(null);
  protected readonly criterios = signal<string[]>([]);
  private readonly sugeridosDelNucleo = signal<string[]>([]);
  protected readonly historial = signal<Historial[]>([]);
  protected motivo = '';
  protected empleo = { rentaPretendida: '', disponibleDesde: '', notas: '' };
  protected arriendo = {
    rentaLiquida: '',
    tieneAval: '',
    uf: null as number | null,
    geocodificar: true,
  };
  private ufOriginal: number | null = null;
  private geocodificarOriginal = true;

  protected readonly etiquetas = computed(() => etiquetasEnUso(this.reglas()));
  protected readonly grupos = computed(() => {
    const f = this.filtro();
    return agrupar(this.reglas(), f && this.etiquetas().some((e) => e.etiqueta === f) ? f : null);
  });
  private readonly prioridadesActuales = computed(() => prioridades(this.reglas()));
  protected readonly totalBlandas = computed(() => this.reglas().filter((r) => !r.dura).length);
  /** Arriendos: criterios sugeridos que aún no están en el perfil. */
  protected readonly sugeridos = computed(() => {
    const usados = new Set(this.reglas().map((r) => r.criterio));
    return this.sugeridosDelNucleo().filter((c) => !usados.has(c));
  });

  protected readonly sinValor = (c: string) => SIN_VALOR.includes(c);
  protected readonly siNo = (c: string) => SI_NO.includes(c);
  protected readonly lista = (c: string) => LISTA.includes(c);
  protected readonly fecha = (c: string) => FECHA.includes(c);
  protected readonly prioridad = (r: ReglaEditable) => this.prioridadesActuales().get(r.clave) ?? 1;
  protected readonly nombreCriterio = (c: string) =>
    this.foco === 'empleo' ? `perfil.criterios.${c}` : `criterios.${c}`;

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      if (this.foco === 'empleo') {
        const p = await firstValueFrom(this.apiPerfil.ver());
        this.reglas.set(aEditables(p.reglas as never));
        this.criterios.set([...p.criterios]);
        this.historial.set(p.historial);
        this.empleo = {
          rentaPretendida:
            p.datos.rentaPretendida === undefined ? '' : String(p.datos.rentaPretendida),
          disponibleDesde: p.datos.disponibleDesde ?? '',
          notas: p.datos.notas ?? '',
        };
      } else {
        const b = await firstValueFrom(this.apiArriendos.busqueda());
        this.reglas.set(aEditables(b.reglas as never));
        this.criterios.set([...b.criterios]);
        this.sugeridosDelNucleo.set([...b.criteriosSugeridos]);
        this.historial.set(b.historial);
        this.arriendo = {
          rentaLiquida: b.persona.rentaLiquida === undefined ? '' : String(b.persona.rentaLiquida),
          tieneAval: b.persona.tieneAval === undefined ? '' : b.persona.tieneAval ? 'si' : 'no',
          uf: b.uf?.valor ?? null,
          geocodificar: b.geocodificar,
        };
        this.ufOriginal = b.uf?.valor ?? null;
        this.geocodificarOriginal = b.geocodificar;
      }
      this.cargado.set(true);
    } catch (e) {
      this.avisos.error(e);
    }
  }

  private refrescar(): void {
    this.reglas.update((rs) => [...rs]);
  }

  protected agregar(criterio = ''): void {
    const f = this.filtro();
    const nueva: ReglaEditable = {
      clave: claveNueva(),
      texto: '',
      criterio,
      valor: { ...valorVacio(), texto: SI_NO.includes(criterio) ? 'si' : '' },
      dura: true,
      etiquetas: f ? [f] : [],
    };
    this.reglas.update((rs) => [...rs.filter((r) => r.dura), nueva, ...rs.filter((r) => !r.dura)]);
  }

  protected quitar(r: ReglaEditable): void {
    this.reglas.update((rs) => rs.filter((x) => x.clave !== r.clave));
  }

  protected mover(r: ReglaEditable, paso: -1 | 1): void {
    this.reglas.update((rs) => moverBlanda(rs, r.clave, paso));
  }

  protected cambiarDura(r: ReglaEditable, dura: boolean): void {
    this.reglas.update((rs) => fijarDura(rs, r.clave, dura));
  }

  protected cambiarCriterio(r: ReglaEditable, criterio: string): void {
    r.criterio = criterio;
    r.valor = { ...valorVacio(), texto: SI_NO.includes(criterio) ? 'si' : '' };
    this.refrescar();
  }

  protected alternarModalidad(r: ReglaEditable, z: Zona, m: ModalidadAceptada, si: boolean): void {
    const actual = r.valor.zonas[z].filter((x) => x !== m);
    r.valor.zonas[z] = si ? MODALIDADES.filter((x) => x === m || actual.includes(x)) : actual;
  }

  protected alternarPlataforma(r: ReglaEditable, p: string, si: boolean): void {
    r.valor.noIndica = si
      ? [...new Set([...r.valor.noIndica, p])]
      : r.valor.noIndica.filter((x) => x !== p);
  }

  protected agregarEtiqueta(r: ReglaEditable, ev: Event): void {
    const campo = ev.target as HTMLInputElement;
    const e = normalizarEtiqueta(campo.value);
    campo.value = '';
    if (!e || r.etiquetas.includes(e)) return;
    r.etiquetas = [...r.etiquetas, e];
    this.refrescar();
  }

  protected quitarEtiqueta(r: ReglaEditable, e: string): void {
    r.etiquetas = r.etiquetas.filter((x) => x !== e);
    this.refrescar();
  }

  protected async guardar(): Promise<void> {
    this.guardando.set(true);
    try {
      const reglas = aEntradas(this.foco, this.reglas());
      const motivo = this.motivo.trim();
      const numero = (t: string) => (t.trim() ? Number(t.replace(/[.$\s]/g, '')) : null);
      if (this.foco === 'empleo') {
        const p = await firstValueFrom(
          this.apiPerfil.cambiar({
            reglas: reglas as never,
            datos: {
              rentaPretendida: numero(this.empleo.rentaPretendida),
              disponibleDesde: this.empleo.disponibleDesde || null,
              notas: this.empleo.notas.trim() || null,
            },
            motivo,
          }),
        );
        this.reglas.set(aEditables(p.reglas as never));
        this.historial.set(p.historial);
        void this.tablero.cargar();
      } else {
        if (this.arriendo.geocodificar !== this.geocodificarOriginal)
          await firstValueFrom(this.apiArriendos.fijarGeocodificar(this.arriendo.geocodificar));
        if (this.arriendo.uf && this.arriendo.uf !== this.ufOriginal)
          await firstValueFrom(
            this.apiArriendos.fijarUf(
              Number(this.arriendo.uf),
              new Date().toLocaleDateString('sv-SE'),
            ),
          );
        const b = await firstValueFrom(
          this.apiArriendos.cambiarBusqueda({
            reglas: reglas as never,
            persona: {
              rentaLiquida: numero(this.arriendo.rentaLiquida),
              tieneAval: this.arriendo.tieneAval === '' ? null : this.arriendo.tieneAval === 'si',
            },
            motivo,
          }),
        );
        this.reglas.set(aEditables(b.reglas as never));
        this.historial.set(b.historial);
        this.ufOriginal = this.arriendo.uf;
        this.geocodificarOriginal = this.arriendo.geocodificar;
        void this.arriendos.cargar(true);
      }
      this.motivo = '';
      this.avisos.exito('perfil.guardado');
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.guardando.set(false);
    }
  }

  protected fechaCorta(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
