import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmTextarea } from '@brecha/ui/textarea';
import { Formato } from '../../nucleo/idioma/idioma';
import { EtiquetaPlataforma } from '../../compartido/piezas';
import { CitaAviso, InsigniaCalce } from '../avisos/piezas';
import { MAXIMO, PreguntarStore } from './preguntar.store';

/** Preguntar (ui.md §5): chat cuyas respuestas citan avisos; cada aviso citado se puede abrir. */
@Component({
  selector: 'b-preguntar',
  imports: [
    RouterLink,
    TranslocoPipe,
    HlmButton,
    HlmTextarea,
    EtiquetaPlataforma,
    InsigniaCalce,
    CitaAviso,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full flex-col gap-4 px-6 pt-[22px] pb-6' },
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex-1">
        <h1 class="titulo-pagina m-0">{{ 'preguntar.titulo' | transloco }}</h1>
        <p class="mt-0.5 mb-0 text-tinta-suave">{{ 'preguntar.resumen' | transloco }}</p>
      </div>
      @if (store.intercambios().length) {
        <span class="text-tinta-suave tabular-nums">{{
          'preguntar.costoTotal' | transloco: { costo: formato.usd(store.costoTotal()) }
        }}</span>
        <button hlmBtn variant="ghost" size="sm" type="button" (click)="store.limpiar()">
          {{ 'preguntar.limpiar' | transloco }}
        </button>
      }
    </div>

    <ol
      class="m-0 flex max-w-4xl flex-1 list-none flex-col gap-5 p-0"
      aria-live="polite"
      [attr.aria-label]="'preguntar.conversacion' | transloco"
    >
      @for (i of store.intercambios(); track i.id) {
        <li class="flex flex-col gap-2.5">
          <p
            class="m-0 max-w-[80%] self-end rounded-[14px] rounded-br-[4px] bg-acento px-3.5 py-2 text-white"
          >
            <span class="solo-lector">{{ 'preguntar.tu' | transloco }}: </span>{{ i.pregunta }}
          </p>
          @switch (i.estado) {
            @case ('esperando') {
              <p class="m-0 text-tinta-suave" role="status">
                {{ 'preguntar.pensando' | transloco }}
              </p>
            }
            @case ('error') {
              <div
                role="alert"
                class="flex items-center gap-3 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
              >
                <span class="flex-1">
                  {{ i.error!.clave | transloco }}
                  @if (i.error!.codigo === 'IA_NO_DISPONIBLE' && i.error!.message) {
                    <span class="block text-[12.5px]">{{ i.error!.message }}</span>
                  }
                </span>
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  type="button"
                  (click)="store.reintentar(i.id)"
                >
                  {{ 'tablero.reintentar' | transloco }}
                </button>
              </div>
            }
            @default {
              <div
                class="flex flex-col gap-3 rounded-[14px] rounded-bl-[4px] border border-linea bg-superficie-panel px-4 py-3"
              >
                <p class="m-0 whitespace-pre-line">
                  <span class="solo-lector">{{ 'preguntar.brecha' | transloco }}: </span
                  >{{ i.respuesta }}
                </p>
                @if (i.citados.length) {
                  <div class="flex flex-col gap-2">
                    <h2 class="etiqueta m-0 font-sans text-tinta-suave">
                      {{ 'preguntar.citados' | transloco: { n: i.citados.length } }}
                    </h2>
                    <ul class="m-0 grid list-none grid-cols-2 gap-2 p-0">
                      @for (a of i.citados; track a.id) {
                        <li
                          class="flex flex-col gap-1.5 rounded-[12px] border border-linea bg-fondo px-3 py-2.5"
                        >
                          <div class="flex items-start gap-2">
                            <a
                              [routerLink]="['/avisos', a.id]"
                              class="min-w-0 flex-1 font-semibold text-tinta no-underline hover:underline"
                              >{{ a.titulo
                              }}<span class="block font-normal text-tinta-suave">{{
                                a.empresa
                              }}</span></a
                            >
                            <b-calce [calce]="a.calce" [analizado]="a.analizado" />
                          </div>
                          <div class="flex items-center gap-2">
                            <b-plataforma [plataforma]="a.plataforma" />
                            <b-cita class="flex-1" [aviso]="a" />
                          </div>
                        </li>
                      }
                    </ul>
                  </div>
                }
                <p class="m-0 text-xs text-tinta-suave tabular-nums">
                  {{ 'preguntar.costo' | transloco: { costo: formato.usd(i.costoUsd) } }}
                  @if (i.descartados) {
                    · {{ 'preguntar.descartados' | transloco: { n: i.descartados } }}
                  }
                </p>
              </div>
            }
          }
        </li>
      } @empty {
        <li
          class="rounded-[12px] border border-dashed border-linea bg-superficie px-4 py-8 text-tinta-suave"
        >
          <p class="m-0 mb-2 font-semibold text-tinta">{{ 'preguntar.vacioTitulo' | transloco }}</p>
          <ul class="m-0 flex flex-col gap-1 pl-5">
            @for (e of ejemplos; track e) {
              <li>
                <button
                  type="button"
                  class="text-left text-acento hover:underline"
                  (click)="usar(e)"
                >
                  {{ e | transloco }}
                </button>
              </li>
            }
          </ul>
        </li>
      }
    </ol>

    <form
      class="sticky bottom-0 flex max-w-4xl items-end gap-2 border-t border-linea bg-fondo pt-3"
      (submit)="$event.preventDefault(); enviar()"
    >
      <div class="flex flex-1 flex-col gap-1">
        <label for="preguntar-texto" class="font-semibold">{{
          'preguntar.etiqueta' | transloco
        }}</label>
        <textarea
          #campo
          hlmTextarea
          id="preguntar-texto"
          rows="2"
          [attr.maxlength]="maximo"
          [value]="texto()"
          (input)="texto.set($any($event.target).value)"
          (keydown.enter)="enter($event)"
          aria-describedby="preguntar-ayuda"
        ></textarea>
        <span id="preguntar-ayuda" class="text-xs text-tinta-suave tabular-nums">{{
          'preguntar.ayuda' | transloco: { n: texto().trim().length, max: maximo }
        }}</span>
      </div>
      <button hlmBtn type="submit" [disabled]="!valida() || store.esperando()">
        {{ 'preguntar.enviar' | transloco }}
      </button>
    </form>
  `,
})
export class PreguntarPagina {
  protected readonly store = inject(PreguntarStore);
  protected readonly formato = inject(Formato);
  private readonly transloco = inject(TranslocoService);
  protected readonly maximo = MAXIMO;
  protected readonly texto = signal('');
  protected readonly valida = computed(() => PreguntarStore.valida(this.texto()));
  private readonly campo = viewChild<ElementRef<HTMLTextAreaElement>>('campo');
  protected readonly ejemplos = ['preguntar.ejemplo1', 'preguntar.ejemplo2', 'preguntar.ejemplo3'];

  protected enter(e: Event): void {
    const k = e as KeyboardEvent;
    if (k.shiftKey) return;
    k.preventDefault();
    void this.enviar();
  }

  protected usar(clave: string): void {
    this.texto.set(this.transloco.translate(clave));
    this.campo()?.nativeElement.focus();
  }

  protected async enviar(): Promise<void> {
    if (!this.valida() || this.store.esperando()) return;
    const t = this.texto();
    this.texto.set('');
    const r = await this.store.preguntar(t);
    if (!r) this.texto.set(t);
  }
}
