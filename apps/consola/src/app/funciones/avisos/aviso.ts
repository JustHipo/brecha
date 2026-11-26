import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { firstValueFrom } from 'rxjs';
import { Ia, type AvisoIaDetalle } from '../../nucleo/api/ia.service';
import { Avisos } from '../../nucleo/avisos';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Formato } from '../../nucleo/idioma/idioma';
import { EtiquetaPlataforma } from '../../compartido/piezas';
import { AvisosStore } from './avisos.store';
import { CitaAviso, InsigniaCalce } from './piezas';

/** Detalle de un aviso (`/avisos/:id`): requisitos, calce, brechas y el texto, con su cita. */
@Component({
  selector: 'b-aviso',
  imports: [RouterLink, TranslocoPipe, HlmButton, EtiquetaPlataforma, InsigniaCalce, CitaAviso],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <a routerLink="/avisos" class="w-fit text-tinta-suave no-underline hover:underline">
      ← {{ 'avisos.volver' | transloco }}
    </a>
    @if (error(); as e) {
      <p
        role="alert"
        class="m-0 max-w-4xl rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
      >
        {{ e.clave | transloco }}
      </p>
    }
    @if (aviso(); as a) {
      <div class="flex max-w-4xl flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="titulo-pagina m-0">{{ a.titulo }}</h1>
          <p class="mt-1 mb-0 text-tinta-suave">
            {{ a.empresa }} · {{ 'modalidades.' + a.modalidad | transloco
            }}{{ a.ubicacion ? ' · ' + a.ubicacion : ''
            }}{{ a.publicadoEn ? ' · ' + formato.fechaCorta(a.publicadoEn) : '' }}
          </p>
        </div>
        <b-plataforma [plataforma]="a.plataforma" />
        <b-calce [calce]="a.calce" [analizado]="a.analizado" />
      </div>
      <div class="flex max-w-4xl flex-wrap items-center gap-3">
        <b-cita class="flex-1" [aviso]="a" />
        @if (a.postulacionId) {
          <a hlmBtn variant="outline" [routerLink]="['/postulaciones', a.postulacionId]">{{
            'avisos.verFicha' | transloco
          }}</a>
        } @else {
          <button hlmBtn type="button" [disabled]="siguiendo()" (click)="seguir(a)">
            {{ 'avisos.seguir' | transloco }}
          </button>
        }
      </div>

      <div class="grid max-w-4xl grid-cols-[1fr_300px] gap-4">
        <section
          class="flex flex-col gap-2 rounded-[12px] border border-linea bg-fondo px-5 py-4"
          aria-labelledby="aviso-requisitos"
        >
          <h2 id="aviso-requisitos" class="m-0 text-lg font-extrabold">
            {{ 'avisos.requisitos' | transloco }}
          </h2>
          @if (!a.analizado) {
            <p class="m-0 text-tinta-suave">{{ 'avisos.sinAnalizar' | transloco }}</p>
          } @else {
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              @for (r of a.requisitos; track r.nombre) {
                <li class="flex items-center gap-2 border-t border-linea py-1.5 first:border-t-0">
                  <span class="flex-1 font-semibold">{{ r.nombre }}</span>
                  @if (r.anos !== null) {
                    <span class="tabular-nums">{{
                      'avisos.anos' | transloco: { n: formato.numero(r.anos) }
                    }}</span>
                  }
                  <span
                    class="etiqueta"
                    [class.text-aviso-tinta]="r.obligatorio"
                    [class.text-tinta-suave]="!r.obligatorio"
                    >{{
                      (r.obligatorio ? 'avisos.obligatorio' : 'avisos.deseable') | transloco
                    }}</span
                  >
                  @if (a.calce !== null) {
                    <span
                      class="text-xs font-semibold"
                      [class.text-[#1D6638]]="cumple(a, r.nombre)"
                      [class.text-error]="!cumple(a, r.nombre)"
                      >{{
                        (cumple(a, r.nombre) ? 'avisos.cumples' : 'avisos.teFalta') | transloco
                      }}</span
                    >
                  }
                </li>
              } @empty {
                <li class="text-tinta-suave">{{ 'avisos.sinRequisitos' | transloco }}</li>
              }
            </ul>
          }
        </section>
        <aside class="flex flex-col gap-3">
          <section
            class="flex flex-col gap-1.5 rounded-[12px] border border-linea bg-superficie-panel px-4 py-3"
            aria-labelledby="aviso-brechas"
          >
            <h2 id="aviso-brechas" class="m-0 text-base font-extrabold">
              {{ 'avisos.brechas' | transloco }}
            </h2>
            @if (a.brechas.length) {
              <ul class="m-0 flex flex-col gap-0.5 pl-5">
                @for (b of a.brechas; track b) {
                  <li>{{ b }}</li>
                }
              </ul>
            } @else {
              <p class="m-0 text-tinta-suave">{{ 'avisos.sinBrechas' | transloco }}</p>
            }
          </section>
          @if (a.stack.length) {
            <section
              class="flex flex-col gap-1.5 rounded-[12px] border border-linea bg-superficie-panel px-4 py-3"
              aria-labelledby="aviso-stack"
            >
              <h2 id="aviso-stack" class="m-0 text-base font-extrabold">
                {{ 'avisos.herramientas' | transloco }}
              </h2>
              <ul class="m-0 flex list-none flex-wrap gap-1 p-0">
                @for (h of a.stack; track h) {
                  <li class="rounded-[5px] bg-fondo px-[7px] py-[1px] text-xs">{{ h }}</li>
                }
              </ul>
            </section>
          }
          @if (a.sueldo) {
            <p class="m-0 rounded-[12px] border border-linea px-4 py-3">
              <span class="font-semibold">{{ 'avisos.sueldo' | transloco }}:</span> {{ a.sueldo }}
            </p>
          }
        </aside>
      </div>

      <section class="max-w-4xl" aria-labelledby="aviso-texto">
        <h2 id="aviso-texto" class="m-0 mb-2 text-lg font-extrabold">
          {{ 'avisos.textoAviso' | transloco }}
        </h2>
        <div
          class="max-h-[480px] overflow-y-auto rounded-[12px] border border-linea bg-superficie px-4 py-3 whitespace-pre-line"
          tabindex="0"
          role="region"
          [attr.aria-label]="'avisos.textoAviso' | transloco"
        >
          {{ a.texto }}
        </div>
        <b-cita class="mt-2" [aviso]="a" />
      </section>
    } @else if (!error()) {
      <p class="m-0 text-tinta-suave" role="status">{{ 'tablero.cargando' | transloco }}</p>
    }
  `,
})
export class AvisoPagina {
  readonly id = input.required<string>();
  private readonly ia = inject(Ia);
  private readonly store = inject(AvisosStore);
  private readonly avisos = inject(Avisos);
  private readonly router = inject(Router);
  protected readonly formato = inject(Formato);

  protected readonly aviso = signal<AvisoIaDetalle | null>(null);
  protected readonly error = signal<ErrorDeApi | null>(null);
  protected readonly siguiendo = signal(false);

  constructor() {
    effect(() => void this.cargar(this.id()));
  }

  private async cargar(id: string): Promise<void> {
    try {
      this.aviso.set(await firstValueFrom(this.ia.aviso(id)));
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0));
    }
  }

  protected cumple(a: AvisoIaDetalle, nombre: string): boolean {
    const n = nombre.toLowerCase();
    return a.cumple.some((c) => c.toLowerCase() === n);
  }

  protected async seguir(a: AvisoIaDetalle): Promise<void> {
    this.siguiendo.set(true);
    const r = await this.store.seguir(a);
    this.siguiendo.set(false);
    const ir = (id: string) => () => void this.router.navigate(['/postulaciones', id]);
    if (r.ok) {
      this.aviso.set({ ...a, postulacionId: r.postulacionId });
      this.avisos.exito(
        r.yaExistia ? 'avisos.yaSeguias' : 'avisos.seguido',
        { empresa: a.empresa },
        { clave: 'tablero.ver', hacer: ir(r.postulacionId) },
      );
    } else if (r.postulacionId) {
      this.avisos.aviso('avisos.creadaSinVinculo', undefined, {
        clave: 'tablero.ver',
        hacer: ir(r.postulacionId),
      });
    } else this.avisos.error(r.error);
  }
}
