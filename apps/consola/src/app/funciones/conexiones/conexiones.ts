import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { firstValueFrom } from 'rxjs';
import { Ia } from '../../nucleo/api/ia.service';
import { Avisos } from '../../nucleo/avisos';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Formato } from '../../nucleo/idioma/idioma';
import { EstadoIaStore } from './estado-ia.store';

interface Fila {
  nombre: string;
  anos: number;
}

const TARJETA =
  'flex flex-col gap-3 rounded-[12px] border border-linea bg-fondo px-5 py-4 shadow-tarjeta';

/**
 * Conexiones (f2.md §8): correo, OpenAI, qué sale de tu máquina y tu perfil. Las credenciales se
 * guardan en Ajustes: si faltan, se enlaza ahí.
 */
@Component({
  selector: 'b-conexiones',
  imports: [RouterLink, TranslocoPipe, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex-1">
        <h1 class="titulo-pagina m-0">{{ 'conexiones.titulo' | transloco }}</h1>
        <p class="mt-0.5 mb-0 text-tinta-suave">{{ 'conexiones.resumen' | transloco }}</p>
      </div>
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        [disabled]="estado.cargando()"
        (click)="estado.cargar()"
      >
        {{ 'conexiones.actualizar' | transloco }}
      </button>
    </div>

    @if (estado.error(); as e) {
      <div
        role="alert"
        class="flex max-w-4xl flex-col gap-1 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
      >
        <span class="font-semibold">{{ e.clave | transloco }}</span>
        @if (estado.apagada()) {
          <span
            >{{ 'conexiones.encender' | transloco }}
            <code class="rounded bg-white/70 px-1">pnpm dev</code></span
          >
        }
      </div>
    }

    @if (estado.conexiones(); as c) {
      <div class="grid max-w-4xl grid-cols-2 gap-4">
        <section [class]="tarjeta" aria-labelledby="con-correo">
          <div class="flex items-center gap-2">
            <h2 id="con-correo" class="m-0 flex-1 text-lg font-extrabold">
              {{ 'conexiones.correo.titulo' | transloco }}
            </h2>
            <span
              class="flex items-center gap-1.5 font-semibold"
              [class]="claseEstado(c.correo.configurado)"
            >
              <span class="size-2 rounded-full bg-current" aria-hidden="true"></span>
              {{
                (c.correo.configurado ? 'conexiones.configurado' : 'conexiones.sinConfigurar')
                  | transloco
              }}
            </span>
          </div>
          <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt class="text-tinta-suave">{{ 'conexiones.correo.ultimaRevision' | transloco }}</dt>
            <dd class="m-0 tabular-nums">
              {{
                c.correo.ultimaRevision
                  ? formato.fechaHora(c.correo.ultimaRevision)
                  : ('conexiones.nunca' | transloco)
              }}
            </dd>
            <dt class="text-tinta-suave">{{ 'conexiones.correo.cada' | transloco }}</dt>
            <dd class="m-0">
              {{ 'conexiones.correo.minutos' | transloco: { n: c.correo.cadaMinutos } }}
            </dd>
            <dt class="text-tinta-suave">{{ 'conexiones.ultimoError' | transloco }}</dt>
            <dd class="m-0" [class.text-error]="c.correo.ultimoError">
              {{ c.correo.ultimoError || ('conexiones.sinErrores' | transloco) }}
            </dd>
          </dl>
          @if (!c.correo.configurado) {
            <p class="m-0 rounded-[10px] bg-superficie px-3 py-2.5 text-[12.5px]">
              {{ 'conexiones.faltaCredencial' | transloco }}
              <a
                routerLink="/ajustes"
                class="font-semibold text-acento underline-offset-2 hover:underline"
                >{{ 'conexiones.irAjustes' | transloco }}</a
              >
            </p>
          }
        </section>

        <section [class]="tarjeta" aria-labelledby="con-ia">
          <div class="flex items-center gap-2">
            <h2 id="con-ia" class="m-0 flex-1 text-lg font-extrabold">
              {{ 'conexiones.ia.titulo' | transloco }}
            </h2>
            <span
              class="flex items-center gap-1.5 font-semibold"
              [class]="claseEstado(c.ia.configurado)"
            >
              <span class="size-2 rounded-full bg-current" aria-hidden="true"></span>
              {{
                (c.ia.configurado ? 'conexiones.configurado' : 'conexiones.sinConfigurar')
                  | transloco
              }}
            </span>
          </div>
          <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt class="text-tinta-suave">{{ 'conexiones.ia.modelo' | transloco }}</dt>
            <dd class="m-0 font-mono text-[12.5px]">{{ c.ia.modelo }}</dd>
            <dt class="text-tinta-suave">{{ 'conexiones.ia.enCola' | transloco }}</dt>
            <dd class="m-0 tabular-nums">{{ c.ia.enCola }}</dd>
            <dt class="text-tinta-suave">{{ 'conexiones.ia.clasificados' | transloco }}</dt>
            <dd class="m-0 tabular-nums">{{ c.ia.clasificados }}</dd>
            <dt class="text-tinta-suave">{{ 'conexiones.ia.gasto' | transloco }}</dt>
            <dd class="m-0 tabular-nums">
              {{ formato.usd(c.ia.gastoMesUsd) }}
              <span class="text-tinta-suave"
                >· {{ 'conexiones.ia.llamadas' | transloco: { n: c.ia.llamadasMes } }}</span
              >
            </dd>
            <dt class="text-tinta-suave">{{ 'conexiones.ultimoError' | transloco }}</dt>
            <dd class="m-0" [class.text-error]="c.ia.ultimoError">
              {{ c.ia.ultimoError || ('conexiones.sinErrores' | transloco) }}
            </dd>
          </dl>
          @if (!c.ia.configurado) {
            <p class="m-0 rounded-[10px] bg-superficie px-3 py-2.5 text-[12.5px]">
              {{ 'conexiones.faltaCredencial' | transloco }}
              <a
                routerLink="/ajustes"
                class="font-semibold text-acento underline-offset-2 hover:underline"
                >{{ 'conexiones.irAjustes' | transloco }}</a
              >
            </p>
          }
        </section>

        <section [class]="tarjeta" class="col-span-2" aria-labelledby="con-salida">
          <h2 id="con-salida" class="m-0 text-lg font-extrabold">
            {{ 'conexiones.salida' | transloco }}
          </h2>
          <ul class="m-0 flex flex-col gap-1 pl-5">
            @for (s of c.salida; track s) {
              <li>{{ s }}</li>
            }
          </ul>
        </section>
      </div>
    } @else if (estado.cargando()) {
      <p class="m-0 text-tinta-suave" role="status">{{ 'conexiones.cargando' | transloco }}</p>
    }

    <section [class]="tarjeta" class="max-w-4xl" aria-labelledby="con-perfil">
      <div>
        <h2 id="con-perfil" class="m-0 text-lg font-extrabold">
          {{ 'conexiones.perfil.titulo' | transloco }}
        </h2>
        <p class="m-0 text-tinta-suave">{{ 'conexiones.perfil.texto' | transloco }}</p>
      </div>
      @if (errorPerfil(); as e) {
        <p class="m-0 text-aviso-tinta" role="alert">{{ e.clave | transloco }}</p>
      } @else {
        <div class="flex items-end gap-3">
          <label class="flex flex-col gap-1">
            <span class="font-semibold">{{ 'conexiones.perfil.anosTotales' | transloco }}</span>
            <input
              hlmInput
              type="number"
              min="0"
              max="60"
              step="0.5"
              class="w-32"
              [value]="anosTotales()"
              (input)="anosTotales.set(numero($any($event.target).value))"
            />
          </label>
        </div>
        <table class="w-full max-w-xl border-collapse text-left">
          <caption class="solo-lector">
            {{
              'conexiones.perfil.herramientas' | transloco
            }}
          </caption>
          <thead>
            <tr class="text-xs text-tinta-suave">
              <th scope="col" class="py-1 font-semibold">
                {{ 'conexiones.perfil.herramienta' | transloco }}
              </th>
              <th scope="col" class="py-1 font-semibold">
                {{ 'conexiones.perfil.anos' | transloco }}
              </th>
              <th scope="col" class="py-1">
                <span class="solo-lector">{{ 'conexiones.perfil.acciones' | transloco }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (f of filas(); track f.nombre; let i = $index) {
              <tr class="border-t border-linea">
                <td class="py-1.5 font-semibold">{{ f.nombre }}</td>
                <td class="py-1.5">
                  <input
                    hlmInput
                    type="number"
                    min="0"
                    max="60"
                    step="0.5"
                    class="w-24"
                    [value]="f.anos"
                    [attr.aria-label]="
                      'conexiones.perfil.anosDe' | transloco: { herramienta: f.nombre }
                    "
                    (input)="cambiarAnos(i, $any($event.target).value)"
                  />
                </td>
                <td class="py-1.5 text-right">
                  <button
                    hlmBtn
                    variant="ghost"
                    size="sm"
                    type="button"
                    (click)="quitar(i)"
                    [attr.aria-label]="
                      'conexiones.perfil.quitarDe' | transloco: { herramienta: f.nombre }
                    "
                  >
                    {{ 'conexiones.perfil.quitar' | transloco }}
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="3" class="py-3 text-tinta-suave">
                  {{ 'conexiones.perfil.vacio' | transloco }}
                </td>
              </tr>
            }
          </tbody>
        </table>
        <form class="flex flex-wrap items-end gap-2" (submit)="$event.preventDefault(); agregar()">
          <label class="flex flex-col gap-1">
            <span class="font-semibold">{{ 'conexiones.perfil.nueva' | transloco }}</span>
            <input
              hlmInput
              class="w-56"
              [value]="nueva()"
              (input)="nueva.set($any($event.target).value)"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-semibold">{{ 'conexiones.perfil.anos' | transloco }}</span>
            <input
              hlmInput
              type="number"
              min="0"
              max="60"
              step="0.5"
              class="w-24"
              [value]="nuevaAnos()"
              (input)="nuevaAnos.set(numero($any($event.target).value))"
            />
          </label>
          <button hlmBtn variant="outline" type="submit" [disabled]="!nueva().trim()">
            {{ 'conexiones.perfil.agregar' | transloco }}
          </button>
        </form>
        <div class="flex items-center gap-3">
          <button hlmBtn type="button" [disabled]="guardando() || !cambiado()" (click)="guardar()">
            {{ 'conexiones.perfil.guardar' | transloco }}
          </button>
          @if (cambiado()) {
            <span class="text-tinta-suave">{{ 'conexiones.perfil.sinGuardar' | transloco }}</span>
          }
        </div>
      }
    </section>
  `,
})
export class ConexionesPagina {
  protected readonly estado = inject(EstadoIaStore);
  protected readonly formato = inject(Formato);
  private readonly ia = inject(Ia);
  private readonly avisos = inject(Avisos);
  protected readonly tarjeta = TARJETA;

  protected readonly filas = signal<Fila[]>([]);
  protected readonly anosTotales = signal(0);
  protected readonly nueva = signal('');
  protected readonly nuevaAnos = signal(1);
  protected readonly guardando = signal(false);
  protected readonly errorPerfil = signal<ErrorDeApi | null>(null);
  private readonly guardado = signal('');
  protected readonly cambiado = computed(() => this.firma() !== this.guardado());

  constructor() {
    void this.estado.cargar();
    void this.cargarPerfil();
  }

  private firma(): string {
    return JSON.stringify([this.anosTotales(), this.filas()]);
  }

  protected claseEstado(ok: boolean): string {
    return ok ? 'text-[#1D6638]' : 'text-aviso-tinta';
  }

  protected numero(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 60) : 0;
  }

  private async cargarPerfil(): Promise<void> {
    try {
      const p = await firstValueFrom(this.ia.perfil());
      this.filas.set(
        Object.entries(p.herramientas)
          .map(([nombre, anos]) => ({ nombre, anos }))
          .sort((a, b) => b.anos - a.anos || a.nombre.localeCompare(b.nombre)),
      );
      this.anosTotales.set(p.anosTotales);
      this.guardado.set(this.firma());
      this.errorPerfil.set(null);
    } catch (e) {
      this.errorPerfil.set(
        e instanceof ErrorDeApi ? e : new ErrorDeApi('IA_APAGADA', String(e), 0),
      );
    }
  }

  protected cambiarAnos(i: number, v: string): void {
    const anos = this.numero(v);
    this.filas.update((fs) => fs.map((f, j) => (j === i ? { ...f, anos } : f)));
  }

  protected quitar(i: number): void {
    this.filas.update((fs) => fs.filter((_, j) => j !== i));
  }

  protected agregar(): void {
    const nombre = this.nueva().trim().slice(0, 80);
    if (!nombre) return;
    const anos = this.nuevaAnos();
    this.filas.update((fs) => {
      const i = fs.findIndex((f) => f.nombre.toLowerCase() === nombre.toLowerCase());
      return i >= 0 ? fs.map((f, j) => (j === i ? { ...f, anos } : f)) : [...fs, { nombre, anos }];
    });
    this.nueva.set('');
    this.nuevaAnos.set(1);
  }

  protected async guardar(): Promise<void> {
    this.guardando.set(true);
    try {
      const r = await firstValueFrom(
        this.ia.guardarPerfil({
          herramientas: Object.fromEntries(this.filas().map((f) => [f.nombre, f.anos])),
          anosTotales: this.anosTotales(),
        }),
      );
      this.guardado.set(this.firma());
      this.avisos.exito('conexiones.perfil.guardado', { n: r.recalculados });
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.guardando.set(false);
    }
  }
}
