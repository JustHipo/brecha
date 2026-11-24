import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Detalle } from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import { HlmTextarea } from '@brecha/ui/textarea';
import type { EstadoDePaso, Paso } from '../../nucleo/api/api.service';
import { Avisos } from '../../nucleo/avisos';
import { Formato } from '../../nucleo/idioma/idioma';
import { FichaStore } from './ficha.store';

type Hito =
  | { tipo: 'paso'; fecha: string; paso: Paso }
  | { tipo: 'estado'; fecha: string; a: string; origen: string };

/**
 * El proceso de una postulación (docs/diseno/pasos.md §7.2, J8): todo lo que te pidieron y lo que hiciste,
 * en el orden en que pasó, mezclado con los cambios de estado. Los pasos son texto libre (J7).
 */
@Component({
  selector: 'b-proceso',
  imports: [ReactiveFormsModule, TranslocoPipe, HlmButton, HlmInput, HlmTextarea],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let d = detalle();
    <section
      aria-labelledby="ficha-proceso"
      class="flex flex-col gap-3 rounded-[14px] border border-linea bg-fondo px-4 py-3.5 shadow-tarjeta"
      data-proceso
    >
      <div class="flex flex-wrap items-center gap-2">
        <h2 id="ficha-proceso" class="m-0 font-sans text-sm font-bold">
          {{ 'pasos.proceso' | transloco }}
        </h2>
        @if (d.pasosPendientes.length) {
          <span
            class="rounded-full bg-acento-suave px-2 py-0.5 text-[11.5px] font-semibold text-acento"
            >{{ 'pasos.nPendientes' | transloco: { n: d.pasosPendientes.length } }}</span
          >
        }
        <span class="flex-1"></span>
        @if (!formulario()) {
          <button hlmBtn variant="outline" size="sm" type="button" (click)="abrir()">
            + {{ 'pasos.agregar' | transloco }}
          </button>
        }
      </div>

      @if (formulario()) {
        <form
          [formGroup]="form"
          (ngSubmit)="guardar()"
          class="flex flex-col gap-2 rounded-[10px] border border-linea bg-superficie p-3"
          data-form-paso
        >
          <label class="flex flex-col gap-1 text-[12.5px] font-semibold">
            {{ 'pasos.descripcion' | transloco }}
            <input
              hlmInput
              formControlName="descripcion"
              maxlength="120"
              [placeholder]="'pasos.descripcionEjemplo' | transloco"
              id="paso-descripcion"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-semibold">
            {{ 'pasos.detalle' | transloco }}
            <textarea hlmTextarea rows="2" formControlName="detalle" id="paso-detalle"></textarea>
          </label>
          <div class="flex flex-wrap items-end gap-3">
            <label class="flex flex-col gap-1 text-[12.5px] font-semibold">
              {{ 'pasos.plazo' | transloco }}
              <input hlmInput type="date" formControlName="plazo" id="paso-plazo" />
            </label>
            @if (!editandoId()) {
              <label class="flex items-center gap-2 pb-2 text-[12.5px]">
                <input
                  type="checkbox"
                  formControlName="hecho"
                  class="accent-acento"
                  id="paso-hecho"
                />
                {{ 'pasos.yaLoHice' | transloco }}
              </label>
            }
            <span class="flex-1"></span>
            <button hlmBtn variant="ghost" size="sm" type="button" (click)="cancelar()">
              {{ 'dialogos.cancelar' | transloco }}
            </button>
            <button hlmBtn size="sm" type="submit" [disabled]="form.invalid || ocupado()">
              {{ 'pasos.guardar' | transloco }}
            </button>
          </div>
        </form>
      }

      @if (hitos().length) {
        <ol class="m-0 flex list-none flex-col gap-0 p-0">
          @for (h of hitos(); track $index) {
            @if (h.tipo === 'estado') {
              <li class="flex gap-3 py-1 text-[12.5px] text-tinta-suave">
                <span class="w-12 shrink-0 tabular-nums">{{ formato.fechaCorta(h.fecha) }}</span>
                <span>{{
                  'pasos.hitoEstado' | transloco: { estado: ('estados.' + h.a | transloco) }
                }}</span>
              </li>
            } @else {
              @let p = h.paso;
              <li
                class="flex gap-3 py-2"
                [class.opacity-60]="p.estado === 'descartado'"
                [attr.data-paso-estado]="p.estado"
              >
                <span class="w-12 shrink-0 pt-0.5 text-[12.5px] text-tinta-suave tabular-nums">{{
                  formato.fechaCorta(p.pedidoEn)
                }}</span>
                <span
                  aria-hidden="true"
                  class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold"
                  [class.border-acento]="p.estado === 'pendiente'"
                  [class.border-ok]="p.estado === 'hecho'"
                  [class.bg-ok]="p.estado === 'hecho'"
                  [class.text-fondo]="p.estado === 'hecho'"
                  [class.border-linea]="p.estado === 'descartado'"
                  >{{ p.estado === 'hecho' ? '✓' : p.estado === 'descartado' ? '–' : '' }}</span
                >
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    class="text-[13.5px] font-semibold"
                    [class.line-through]="p.estado === 'descartado'"
                  >
                    <span class="solo-lector">{{ 'pasos.estado.' + p.estado | transloco }}: </span>
                    {{ p.descripcion }}
                  </span>
                  @if (p.detalle) {
                    <span class="text-[12.5px] text-tinta">{{ p.detalle }}</span>
                  }
                  <span class="text-[12px] text-tinta-suave">
                    {{ 'pasos.fuente.' + p.fuente | transloco }}
                    @if (p.fuente !== 'persona') {
                      · {{ 'pasos.por.' + p.registradoPor | transloco }}
                    }
                    @if (p.plazo && p.estado === 'pendiente') {
                      ·
                      <span
                        class="font-semibold"
                        [class.text-prioridad-alta]="(p.diasAlPlazo ?? 99) <= 1"
                        >{{
                          'pasos.plazoEl' | transloco: { fecha: formato.fechaCorta(p.plazo) }
                        }}</span
                      >
                    }
                    @if (otras(p).length) {
                      · {{ 'pasos.tambien' | transloco: { otras: otras(p).join(', ') } }}
                    }
                  </span>
                  @if (p.cierre) {
                    <span class="text-[12px] text-tinta-suave"
                      >{{
                        'pasos.cierre.' + p.estado
                          | transloco
                            : {
                                por: ('pasos.cerradoPor.' + p.cierre.por | transloco),
                                fecha: formato.fechaCorta(p.cierre.en),
                              }
                      }}{{ p.cierre.nota ? ' · ' + p.cierre.nota : '' }}</span
                    >
                  }
                  @if (p.sugerenciaCierre && p.estado === 'pendiente') {
                    <span class="text-[12px] font-semibold text-acento" data-sugerencia-cierre>{{
                      'pasos.sugerencia' | transloco
                    }}</span>
                  }
                  <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                    @if (p.enlace && p.estado === 'pendiente') {
                      <a
                        hlmBtn
                        variant="outline"
                        size="xs"
                        [href]="p.enlace"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ 'pasos.abrir' | transloco }} ↗</a
                      >
                    }
                    @if (p.estado === 'pendiente') {
                      <button
                        hlmBtn
                        size="xs"
                        type="button"
                        [disabled]="ocupado()"
                        (click)="resolver(p, 'hecho')"
                        [attr.aria-label]="'pasos.marcarHecho' | transloco: { paso: p.descripcion }"
                        data-paso-hecho
                      >
                        {{ 'pasos.hecho' | transloco }}
                      </button>
                      <button
                        hlmBtn
                        variant="ghost"
                        size="xs"
                        type="button"
                        [disabled]="ocupado()"
                        (click)="resolver(p, 'descartado')"
                      >
                        {{ 'pasos.descartar' | transloco }}
                      </button>
                      <button hlmBtn variant="ghost" size="xs" type="button" (click)="editar(p)">
                        {{ 'pasos.editar' | transloco }}
                      </button>
                    } @else {
                      <button
                        hlmBtn
                        variant="ghost"
                        size="xs"
                        type="button"
                        [disabled]="ocupado()"
                        (click)="resolver(p, 'pendiente')"
                      >
                        {{ 'pasos.reabrir' | transloco }}
                      </button>
                    }
                  </div>
                </div>
              </li>
            }
          }
        </ol>
      }
      @if (!d.pasos.length && !formulario()) {
        <p class="m-0 text-[12.5px] text-tinta-suave">{{ 'pasos.vacio' | transloco }}</p>
      }
    </section>
  `,
})
export class Proceso {
  readonly detalle = input.required<Detalle>();
  private readonly store = inject(FichaStore);
  private readonly avisos = inject(Avisos);
  protected readonly formato = inject(Formato);

  protected readonly formulario = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly form = new FormGroup({
    descripcion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(120)],
    }),
    detalle: new FormControl('', { nonNullable: true }),
    plazo: new FormControl('', { nonNullable: true }),
    hecho: new FormControl(false, { nonNullable: true }),
  });

  /** Pasos y cambios de estado en el orden en que pasaron (pasos.md §7.2). */
  protected readonly hitos = computed<Hito[]>(() => {
    const d = this.detalle();
    if (!d.pasos.length) return [];
    const pasos: Hito[] = d.pasos.map((p) => ({ tipo: 'paso', fecha: p.pedidoEn, paso: p }));
    const estados: Hito[] = d.historial.map((c) => ({
      tipo: 'estado',
      fecha: c.ocurridoEn,
      a: c.a,
      origen: c.origen,
    }));
    return [...pasos, ...estados].sort((a, b) => a.fecha.localeCompare(b.fecha));
  });

  protected otras(p: Paso): string[] {
    return p.postulaciones.filter((x) => x.id !== this.detalle().id).map((x) => x.titulo);
  }

  protected abrir(): void {
    this.editandoId.set(null);
    this.form.reset({ descripcion: '', detalle: '', plazo: '', hecho: false });
    this.formulario.set(true);
  }

  protected editar(p: Paso): void {
    this.editandoId.set(p.id);
    this.form.reset({
      descripcion: p.descripcion,
      detalle: p.detalle ?? '',
      plazo: p.plazo ?? '',
      hecho: false,
    });
    this.formulario.set(true);
  }

  protected cancelar(): void {
    this.formulario.set(false);
    this.editandoId.set(null);
  }

  protected async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const id = this.editandoId();
    const paso = id ? this.detalle().pasos.find((x) => x.id === id) : undefined;
    await this.correr(async () => {
      if (paso) {
        await this.store.editarPaso(paso.id, {
          version: paso.version,
          descripcion: v.descripcion.trim(),
          detalle: v.detalle.trim() || null,
          plazo: v.plazo || null,
        });
      } else {
        await this.store.registrarPaso({
          descripcion: v.descripcion.trim(),
          ...(v.detalle.trim() ? { detalle: v.detalle.trim() } : {}),
          ...(v.plazo ? { plazo: v.plazo } : {}),
          ...(v.hecho ? { estado: 'hecho' as const } : {}),
        });
      }
      this.cancelar();
    });
  }

  protected async resolver(p: Paso, estado: EstadoDePaso): Promise<void> {
    await this.correr(async () => {
      await this.store.resolverPaso(p.id, estado);
      if (estado === 'hecho') {
        this.avisos.exito(
          'pasos.marcado',
          { paso: p.descripcion },
          {
            clave: 'pasos.deshacer',
            hacer: () => void this.correr(() => this.store.resolverPaso(p.id, 'pendiente')),
          },
        );
      }
    });
  }

  private async correr(f: () => Promise<unknown>): Promise<void> {
    this.ocupado.set(true);
    try {
      await f();
    } catch (e) {
      this.avisos.error(e);
    } finally {
      this.ocupado.set(false);
    }
  }
}
