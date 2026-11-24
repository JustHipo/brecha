import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { firstValueFrom } from 'rxjs';
import { Api, type ResultadoCsv, type TipoCsv } from '../../nucleo/api/api.service';
import { Ia } from '../../nucleo/api/ia.service';
import { Avisos } from '../../nucleo/avisos';
import { guardarArchivo, nombreDeArchivo } from '../../nucleo/descargas';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { TableroStore } from '../tablero/tablero.store';

/**
 * Importar y exportar CSV (docs/diseno/csv.md §7): postulaciones y contactos en el formato de Brecha, con un
 * informe por fila (línea, columna y motivo) y las plantillas para empezar.
 */
@Component({
  selector: 'b-csv',
  imports: [TranslocoPipe, RouterLink, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5 px-6 pt-[22px] pb-8 max-w-[960px]' },
  template: `
    <h1 class="titulo-pagina m-0">{{ 'csv.titulo' | transloco }}</h1>
    <p class="m-0 max-w-[68ch] text-tinta-suave">{{ 'csv.intro' | transloco }}</p>

    <section
      class="flex flex-col gap-3 rounded-[12px] border border-linea p-5"
      aria-labelledby="csv-importar"
    >
      <h2 id="csv-importar" class="m-0 font-titulo text-lg font-extrabold">
        {{ 'csv.importar' | transloco }}
      </h2>
      <p class="m-0 text-tinta-suave">{{ 'csv.orden' | transloco }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <label
          hlmBtn
          class="cursor-pointer"
          data-tutorial="importar-archivo"
          [class.opacity-60]="importando()"
        >
          {{ (importando() ? 'csv.importando' : 'csv.elegirArchivo') | transloco }}
          <input
            type="file"
            accept=".csv,text/csv"
            class="solo-lector"
            data-archivo-csv
            [disabled]="importando()"
            (change)="importar($event)"
          />
        </label>
        <span class="text-[12.5px] text-tinta-suave">{{ 'csv.formato' | transloco }}</span>
      </div>

      @if (error(); as e) {
        <div
          role="alert"
          class="rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
        >
          <strong>{{ 'csv.noSeImporto' | transloco }}</strong> {{ e }}
        </div>
      }

      @if (resultado(); as r) {
        <div class="flex flex-col gap-3" aria-live="polite" data-resultado-csv>
          <p class="m-0 font-semibold">
            {{ 'csv.resumen.' + r.tipo | transloco: { archivo: archivo() } }}
          </p>
          <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
            @for (c of conteos(); track c.clave) {
              <li
                class="rounded-full border px-3 py-1 text-[13px] tabular-nums"
                [class]="c.clase"
                [attr.data-conteo]="c.clave"
              >
                <strong>{{ c.n }}</strong> {{ 'csv.conteos.' + c.clave | transloco }}
              </li>
            }
          </ul>
          @for (a of r.advertencias; track a) {
            <p class="m-0 text-[13px] text-aviso-tinta">⚠ {{ a }}</p>
          }
          @if (avisosEnProceso()) {
            <p class="m-0 text-[13px] text-tinta-suave">{{ 'csv.avisosEnProceso' | transloco }}</p>
          }
          @if (filasConDetalle().length) {
            <div class="overflow-x-auto rounded-[10px] border border-linea">
              <table class="w-full border-collapse text-left text-[13px]">
                <caption class="solo-lector">
                  {{
                    'csv.tablaFilas' | transloco
                  }}
                </caption>
                <thead class="bg-superficie">
                  <tr>
                    <th scope="col" class="px-3 py-2 text-xs font-semibold text-tinta-suave">
                      {{ 'csv.columnas.linea' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 text-xs font-semibold text-tinta-suave">
                      {{ 'csv.columnas.resultado' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 text-xs font-semibold text-tinta-suave">
                      {{ 'csv.columnas.fila' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 text-xs font-semibold text-tinta-suave">
                      {{ 'csv.columnas.detalle' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (f of filasConDetalle(); track f.fila) {
                    <tr class="border-t border-linea align-top" [attr.data-fila]="f.fila">
                      <td class="px-3 py-2 tabular-nums">{{ f.fila }}</td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        @if (f.resultado === 'error') {
                          <span class="font-semibold text-brecha"
                            >✕ {{ 'csv.resultados.error' | transloco }}</span
                          >
                        } @else {
                          <span class="text-aviso-tinta"
                            >⚠ {{ 'csv.resultados.' + f.resultado | transloco }}</span
                          >
                        }
                      </td>
                      <td class="max-w-[280px] px-3 py-2 break-words">{{ f.clave }}</td>
                      <td class="px-3 py-2">
                        @if (f.resultado === 'error') {
                          @if (f.campo) {
                            <code class="rounded bg-superficie px-1">{{ f.campo }}</code>
                          }
                          {{ f.mensaje }}
                        }
                        @for (a of f.advertencias; track a) {
                          <span class="block">{{ a }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <div class="flex gap-2">
            @if (r.tipo === 'postulaciones') {
              <a hlmBtn variant="outline" size="sm" routerLink="/lista">{{
                'csv.verLista' | transloco
              }}</a>
            } @else {
              <a hlmBtn variant="outline" size="sm" routerLink="/red">{{
                'csv.verRed' | transloco
              }}</a>
            }
          </div>
        </div>
      }
    </section>

    <section
      class="flex flex-col gap-3 rounded-[12px] border border-linea p-5"
      aria-labelledby="csv-exportar"
    >
      <h2 id="csv-exportar" class="m-0 font-titulo text-lg font-extrabold">
        {{ 'csv.exportar' | transloco }}
      </h2>
      <p class="m-0 text-tinta-suave">{{ 'csv.exportarTexto' | transloco }}</p>
      <div class="flex flex-wrap gap-2">
        @for (t of tipos; track t) {
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="bajar('exportar', t)"
            [attr.data-exportar]="t"
          >
            {{ 'csv.exportar_' + t | transloco }}
          </button>
        }
      </div>
    </section>

    <section
      class="flex flex-col gap-3 rounded-[12px] border border-linea p-5"
      aria-labelledby="csv-plantillas"
    >
      <h2 id="csv-plantillas" class="m-0 font-titulo text-lg font-extrabold">
        {{ 'csv.plantillas' | transloco }}
      </h2>
      <p class="m-0 text-tinta-suave">{{ 'csv.plantillasTexto' | transloco }}</p>
      <div class="flex flex-wrap gap-2">
        @for (t of tipos; track t) {
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="bajar('plantillas', t)"
            [attr.data-plantilla]="t"
          >
            {{ 'csv.plantilla_' + t | transloco }}
          </button>
        }
      </div>
    </section>
  `,
})
export class CsvPagina {
  private readonly api = inject(Api);
  private readonly ia = inject(Ia);
  private readonly avisos = inject(Avisos);
  private readonly tablero = inject(TableroStore);

  protected readonly tipos: TipoCsv[] = ['postulaciones', 'contactos'];
  protected readonly importando = signal(false);
  protected readonly resultado = signal<ResultadoCsv | null>(null);
  protected readonly archivo = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly avisosEnProceso = signal(false);

  protected readonly filasConDetalle = computed(() =>
    (this.resultado()?.filas ?? []).filter((f) => f.resultado === 'error' || f.advertencias.length),
  );
  protected readonly conteos = computed(() => {
    const r = this.resultado();
    if (!r) return [];
    return [
      { clave: 'creadas', n: r.creadas, clase: 'border-linea bg-superficie' },
      { clave: 'yaEstaban', n: r.yaEstaban, clase: 'border-linea bg-superficie' },
      ...(r.tipo === 'contactos'
        ? [{ clave: 'actualizadas', n: r.actualizadas, clase: 'border-linea bg-superficie' }]
        : []),
      {
        clave: 'conAdvertencias',
        n: r.conAdvertencias,
        clase: 'border-aviso-borde bg-aviso-fondo text-aviso-tinta',
      },
      { clave: 'errores', n: r.errores, clase: 'border-brecha bg-brecha-fondo text-brecha' },
    ];
  });

  protected async importar(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;
    this.importando.set(true);
    this.error.set(null);
    this.resultado.set(null);
    this.avisosEnProceso.set(false);
    this.archivo.set(archivo.name);
    try {
      const r = await firstValueFrom(this.api.importarCsv(await archivo.text()));
      this.resultado.set(r);
      if (r.tipo === 'postulaciones' && r.creadas > 0) {
        void this.tablero.cargar(true);
        // Sin esperar la vuelta del vigía: el servicio con IA trae los avisos y calcula el calce.
        try {
          await firstValueFrom(this.ia.procesarAvisos());
          this.avisosEnProceso.set(true);
        } catch {
          // Sin la API de IA, el vigía los toma en su próxima vuelta.
        }
      }
    } catch (err) {
      this.error.set(err instanceof ErrorDeApi ? err.message : String(err));
    } finally {
      this.importando.set(false);
      input.value = '';
    }
  }

  protected async bajar(que: 'exportar' | 'plantillas', tipo: TipoCsv): Promise<void> {
    try {
      const r = await firstValueFrom(this.api.descargarCsv(`${que}/${tipo}`));
      if (r.body) guardarArchivo(r.body, nombreDeArchivo(r, `${tipo}.csv`));
    } catch (e) {
      this.avisos.error(e);
    }
  }
}
