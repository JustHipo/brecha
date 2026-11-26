import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { IaArriendos, type RespuestaArriendos } from '../../nucleo/api/arriendos.api';
import { aError } from './arriendos.store';

/** Preguntar sobre las propiedades que sigues: responde con tus datos y cita solo propiedades que existen. */
@Component({
  selector: 'b-arriendos-preguntar',
  imports: [FormsModule, RouterLink, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex max-w-[820px] flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <h1 class="titulo-pagina m-0">{{ 'nav.preguntar' | transloco }}</h1>
    <p class="m-0 text-tinta-suave">{{ 'preguntarArriendo.ayuda' | transloco }}</p>
    <form class="flex gap-2" (submit)="$event.preventDefault(); preguntar()">
      <label class="flex flex-1 flex-col">
        <span class="solo-lector">{{ 'preguntarArriendo.pregunta' | transloco }}</span>
        <input
          hlmInput
          name="pregunta"
          [(ngModel)]="pregunta"
          [placeholder]="'preguntarArriendo.ejemplo' | transloco"
        />
      </label>
      <button hlmBtn type="submit" [disabled]="pregunta.trim().length < 3 || cargando()">
        {{ 'preguntarArriendo.preguntar' | transloco }}
      </button>
    </form>
    @if (cargando()) {
      <p class="m-0 text-tinta-suave" role="status">
        {{ 'preguntarArriendo.pensando' | transloco }}
      </p>
    }
    @if (error()) {
      <div
        role="alert"
        class="rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
      >
        {{ error() }}
      </div>
    }
    @if (r(); as r) {
      <section
        class="flex flex-col gap-2 rounded-[12px] border border-linea p-4"
        aria-live="polite"
      >
        <p class="m-0 whitespace-pre-line">{{ r.respuesta }}</p>
        @if (r.citados.length) {
          <ul class="m-0 flex flex-col gap-1 pl-5">
            @for (c of r.citados; track c.id) {
              <li>
                <a [routerLink]="['/arriendos/propiedades', c.id]">{{ c.titulo }}</a>
                <span class="text-tinta-suave">
                  · {{ 'estadosArriendo.' + c.estado | transloco }}</span
                >
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class ArriendosPreguntarPagina {
  private readonly ia = inject(IaArriendos);
  protected pregunta = '';
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly r = signal<RespuestaArriendos | null>(null);

  protected async preguntar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.r.set(await firstValueFrom(this.ia.preguntar(this.pregunta.trim())));
    } catch (e) {
      this.error.set(aError(e).message);
    } finally {
      this.cargando.set(false);
    }
  }
}
