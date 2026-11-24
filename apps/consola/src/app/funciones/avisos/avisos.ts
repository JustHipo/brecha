import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { Ia, type AvisoIa, type AvisoPegado } from '../../nucleo/api/ia.service';
import { Avisos } from '../../nucleo/avisos';
import { EtiquetaPlataforma } from '../../compartido/piezas';
import { MODALIDADES, PLATAFORMAS } from '../bandeja/dialogos';
import { Dialogos } from '../postulacion/dialogos/dialogos.service';
import { AvisosStore } from './avisos.store';
import { DialogoPegarAviso } from './pegar';
import { CitaAviso, InsigniaCalce } from './piezas';

/** Avisos (ui.md §5, f2.md §8): calce, brechas y herramientas; filtrar y «Seguir». */
@Component({
  selector: 'b-avisos',
  imports: [
    RouterLink,
    TranslocoPipe,
    HlmButton,
    HlmInput,
    EtiquetaPlataforma,
    InsigniaCalce,
    CitaAviso,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-[260px] flex-1">
        <h1 class="titulo-pagina m-0">{{ 'avisos.titulo' | transloco }}</h1>
        @if (store.conteo(); as c) {
          <p class="mt-0.5 mb-0 text-tinta-suave">
            {{
              'avisos.conteo'
                | transloco: { total: c.total, analizados: c.analizados, vinculados: c.vinculados }
            }}
          </p>
        }
      </div>
      <button hlmBtn variant="outline" type="button" (click)="pegar()">
        {{ 'avisos.pegar' | transloco }}
      </button>
    </div>

    <form
      class="flex flex-wrap items-end gap-2 rounded-[12px] border border-linea bg-superficie px-4 py-3"
      (submit)="$event.preventDefault(); buscarGetOnBoard()"
    >
      <label class="flex flex-col gap-1">
        <span class="font-semibold">{{ 'avisos.buscarGob' | transloco }}</span>
        <input
          hlmInput
          class="w-72 bg-fondo"
          [value]="consulta()"
          (input)="consulta.set($any($event.target).value)"
          [placeholder]="'avisos.buscarGobEjemplo' | transloco"
        />
      </label>
      <button hlmBtn type="submit" [disabled]="buscando() || consulta().trim().length < 2">
        {{ (buscando() ? 'avisos.buscando' : 'avisos.buscar') | transloco }}
      </button>
      <span class="text-[12.5px] text-tinta-suave">{{ 'avisos.buscarGobAyuda' | transloco }}</span>
    </form>

    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-tinta-suave">{{
          'avisos.filtroTexto' | transloco
        }}</span>
        <input
          hlmInput
          type="search"
          class="w-64"
          [value]="store.filtros().texto ?? ''"
          (input)="filtrar({ texto: $any($event.target).value })"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-tinta-suave">{{
          'nueva.plataforma' | transloco
        }}</span>
        <select
          class="h-9 rounded-md border border-linea bg-fondo px-2"
          (change)="filtrar({ plataforma: $any($event.target).value })"
        >
          <option value="">{{ 'lista.todos' | transloco }}</option>
          @for (p of plataformas; track p) {
            <option [value]="p" [selected]="store.filtros().plataforma === p">
              {{ 'plataformas.' + p | transloco }}
            </option>
          }
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-tinta-suave">{{
          'nueva.modalidad' | transloco
        }}</span>
        <select
          class="h-9 rounded-md border border-linea bg-fondo px-2"
          (change)="filtrar({ modalidad: $any($event.target).value })"
        >
          <option value="">{{ 'lista.todos' | transloco }}</option>
          @for (m of modalidades; track m) {
            <option [value]="m" [selected]="store.filtros().modalidad === m">
              {{ 'modalidades.' + m | transloco }}
            </option>
          }
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-tinta-suave">{{
          'avisos.calceMinimo' | transloco
        }}</span>
        <select
          class="h-9 rounded-md border border-linea bg-fondo px-2"
          (change)="
            filtrar({ calceMinimo: $any($event.target).value ? +$any($event.target).value : null })
          "
        >
          <option value="">{{ 'lista.todos' | transloco }}</option>
          @for (n of [40, 60, 70, 80]; track n) {
            <option [value]="n" [selected]="store.filtros().calceMinimo === n">{{ n }}+</option>
          }
        </select>
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

    <ul class="m-0 flex max-w-5xl list-none flex-col gap-3 p-0" [attr.aria-busy]="store.cargando()">
      @for (a of store.items(); track a.id) {
        <li
          class="flex flex-col gap-2 rounded-[12px] border border-linea bg-fondo px-4 py-3.5 shadow-tarjeta"
        >
          <div class="flex flex-wrap items-start gap-3">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 class="m-0 font-sans text-[15px] font-semibold">
                <a
                  [routerLink]="['/avisos', a.id]"
                  class="text-tinta no-underline hover:underline"
                  >{{ a.titulo }}</a
                >
              </h2>
              <span class="text-tinta-suave">
                {{ a.empresa }} · {{ 'modalidades.' + a.modalidad | transloco
                }}{{ a.ubicacion ? ' · ' + a.ubicacion : '' }}{{ a.sueldo ? ' · ' + a.sueldo : '' }}
              </span>
            </div>
            <b-plataforma [plataforma]="a.plataforma" />
            <b-calce [calce]="a.calce" [analizado]="a.analizado" />
          </div>
          @if (a.stack.length) {
            <ul
              class="m-0 flex list-none flex-wrap gap-1 p-0"
              [attr.aria-label]="'avisos.herramientas' | transloco"
            >
              @for (h of a.stack; track h) {
                <li class="rounded-[5px] bg-superficie px-[7px] py-[1px] text-xs">{{ h }}</li>
              }
            </ul>
          }
          @if (a.brechas.length) {
            <p class="m-0 text-[12.5px]">
              <span class="font-semibold text-aviso-tinta"
                >{{ 'avisos.brechas' | transloco }}:</span
              >
              {{ a.brechas.join(', ') }}
            </p>
          }
          <div class="flex flex-wrap items-center gap-3">
            <b-cita class="flex-1" [aviso]="a" />
            @if (a.postulacionId) {
              <a
                hlmBtn
                size="sm"
                variant="outline"
                [routerLink]="['/postulaciones', a.postulacionId]"
                >{{ 'avisos.verFicha' | transloco }}</a
              >
            } @else {
              <button
                hlmBtn
                size="sm"
                type="button"
                [disabled]="store.siguiendo().has(a.id)"
                (click)="seguir(a)"
                [attr.aria-label]="
                  'avisos.seguirDe' | transloco: { titulo: a.titulo, empresa: a.empresa }
                "
              >
                {{ 'avisos.seguir' | transloco }}
              </button>
            }
          </div>
        </li>
      } @empty {
        @if (!store.cargando() && !store.error()) {
          <li
            class="rounded-[12px] border border-dashed border-linea bg-superficie px-4 py-10 text-center"
          >
            <p class="m-0 font-semibold">{{ 'avisos.vacioTitulo' | transloco }}</p>
            <p class="mt-1 mb-0 text-tinta-suave">{{ 'avisos.vacioTexto' | transloco }}</p>
          </li>
        }
      }
    </ul>
  `,
})
export class AvisosPagina {
  protected readonly store = inject(AvisosStore);
  private readonly ia = inject(Ia);
  private readonly avisos = inject(Avisos);
  private readonly dialogos = inject(Dialogos);
  private readonly router = inject(Router);

  protected readonly plataformas = PLATAFORMAS;
  protected readonly modalidades = MODALIDADES;
  protected readonly consulta = signal('');
  protected readonly buscando = signal(false);
  private espera?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.store.cargar();
  }

  protected filtrar(cambio: Partial<ReturnType<AvisosStore['filtros']>>): void {
    this.store.filtros.update((f) => ({ ...f, ...cambio }));
    clearTimeout(this.espera);
    this.espera = setTimeout(() => void this.store.cargar(), 250);
  }

  protected async seguir(a: AvisoIa): Promise<void> {
    const r = await this.store.seguir(a);
    const ir = (id: string) => () => void this.router.navigate(['/postulaciones', id]);
    if (r.ok)
      this.avisos.exito(
        r.yaExistia ? 'avisos.yaSeguias' : 'avisos.seguido',
        { empresa: a.empresa },
        { clave: 'tablero.ver', hacer: ir(r.postulacionId) },
      );
    else if (r.postulacionId)
      this.avisos.aviso('avisos.creadaSinVinculo', undefined, {
        clave: 'tablero.ver',
        hacer: ir(r.postulacionId),
      });
    else this.avisos.error(r.error);
  }

  protected async buscarGetOnBoard(): Promise<void> {
    const q = this.consulta().trim();
    if (q.length < 2) return;
    this.buscando.set(true);
    try {
      const r = await firstValueFrom(this.ia.buscarEnGetOnBoard(q));
      if (r.error) this.avisos.aviso('avisos.busquedaConError', { error: r.error });
      else
        this.avisos.exito('avisos.busquedaLista', { encontrados: r.encontrados, nuevos: r.nuevos });
      await this.store.cargar();
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.buscando.set(false);
    }
  }

  protected async pegar(): Promise<void> {
    const cuerpo = await this.dialogos.abrir<AvisoPegado, object>(DialogoPegarAviso, {});
    if (!cuerpo) return;
    try {
      const a = await firstValueFrom(this.ia.pegarAviso(cuerpo));
      this.avisos.exito('avisos.pegado', undefined, {
        clave: 'tablero.ver',
        hacer: () => void this.router.navigate(['/avisos', a.id]),
      });
      await this.store.cargar();
    } catch (e) {
      this.avisos.error(e);
    }
  }
}
