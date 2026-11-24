import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmSkeleton } from '@brecha/ui/skeleton';
import type { AvisoEntrada, SenalPendiente } from '../../nucleo/api/api.service';
import { Avisos } from '../../nucleo/avisos';
import { Formato } from '../../nucleo/idioma/idioma';
import { EtiquetaPlataforma } from '../../compartido/piezas';
import { Dialogos } from '../postulacion/dialogos/dialogos.service';
import { BandejaStore } from './bandeja.store';
import { DialogoAsociar, DialogoConfirmar, DialogoCrearDesdeSenal } from './dialogos';

/** Bandeja (ui.md §5, f2.md §8): señales sin postulación, para asociar, crear o descartar. */
@Component({
  selector: 'b-bandeja',
  imports: [TranslocoPipe, HlmButton, HlmSkeleton, EtiquetaPlataforma],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <div>
      <h1 class="titulo-pagina m-0">{{ 'bandeja.titulo' | transloco }}</h1>
      <p class="mt-0.5 mb-0 text-tinta-suave">
        {{ 'bandeja.resumen' | transloco: { n: store.conteo() } }}
      </p>
    </div>

    @if (store.error(); as e) {
      <div
        role="alert"
        class="flex items-center gap-3 rounded-[10px] border border-aviso-borde bg-aviso-fondo px-3.5 py-3 text-aviso-tinta"
      >
        <span class="flex-1">{{ e.clave | transloco }}</span>
        <button hlmBtn variant="outline" size="sm" type="button" (click)="store.cargar()">
          {{ 'tablero.reintentar' | transloco }}
        </button>
      </div>
    }

    @if (store.estado() === 'cargando' && !store.senales().length) {
      <div
        class="flex flex-col gap-3"
        role="status"
        [attr.aria-label]="'tablero.cargando' | transloco"
      >
        @for (i of [1, 2, 3]; track i) {
          <hlm-skeleton class="h-[120px] w-full max-w-4xl rounded-[12px]" />
        }
      </div>
    } @else {
      <ul class="m-0 flex max-w-4xl list-none flex-col gap-3 p-0">
        @for (s of store.pendientes(); track s.id) {
          <li
            class="flex flex-col gap-2.5 rounded-[12px] border border-linea bg-fondo px-4 py-3.5 shadow-tarjeta"
            data-senal
          >
            <div class="flex flex-wrap items-center gap-2 text-tinta-suave">
              <span class="etiqueta text-tinta-suave">{{ 'fuentes.' + s.fuente | transloco }}</span>
              <b-plataforma [plataforma]="s.plataforma" />
              @if (s.remitente) {
                <span class="truncate">{{ s.remitente }}</span>
              }
              <span class="ml-auto tabular-nums">{{ formato.fechaHora(s.recibidaEn) }}</span>
            </div>
            @if (s.asunto) {
              <h2 class="m-0 font-sans text-[15px] font-semibold">{{ s.asunto }}</h2>
            }
            <p class="m-0">{{ s.resumen }}</p>
            @if (s.pasoPropuesto; as p) {
              <p
                class="m-0 flex items-center gap-2 rounded-lg bg-acento-suave px-2.5 py-1.5 text-[13px] font-semibold text-tinta"
                data-pide
              >
                <span aria-hidden="true" class="h-4 w-1 rounded-full bg-acento"></span>
                {{ 'bandeja.pide' | transloco: { paso: p.descripcion } }}
              </p>
            }
            <dl class="m-0 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
              <div class="flex gap-1">
                <dt class="text-tinta-suave">{{ 'bandeja.empresa' | transloco }}</dt>
                <dd class="m-0 font-semibold">
                  {{ s.empresaDetectada || ('bandeja.sinDetectar' | transloco) }}
                </dd>
              </div>
              <div class="flex gap-1">
                <dt class="text-tinta-suave">{{ 'bandeja.cargo' | transloco }}</dt>
                <dd class="m-0 font-semibold">
                  {{ s.cargoDetectado || ('bandeja.sinDetectar' | transloco) }}
                </dd>
              </div>
              @if (s.estadoSugerido) {
                <div class="flex gap-1">
                  <dt class="text-tinta-suave">{{ 'bandeja.sugiere' | transloco }}</dt>
                  <dd class="m-0 font-semibold">
                    {{ 'estados.' + s.estadoSugerido | transloco }}
                  </dd>
                </div>
              }
              <div class="flex gap-1">
                <dt class="text-tinta-suave">{{ 'bandeja.confianza' | transloco }}</dt>
                <dd class="m-0 font-semibold tabular-nums">
                  {{ formato.porcentaje(s.confianza) }}
                </dd>
              </div>
            </dl>
            <div class="flex flex-wrap gap-2">
              <button
                hlmBtn
                size="sm"
                type="button"
                [disabled]="store.ocupadas().has(s.id)"
                (click)="asociar(s)"
                [attr.aria-label]="'bandeja.asociarDe' | transloco: { resumen: s.resumen }"
              >
                {{ 'bandeja.asociarBoton' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                [disabled]="store.ocupadas().has(s.id)"
                (click)="crear(s)"
                [attr.aria-label]="'bandeja.crearDe' | transloco: { resumen: s.resumen }"
              >
                {{ 'bandeja.crearBoton' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                variant="ghost"
                type="button"
                [disabled]="store.ocupadas().has(s.id)"
                (click)="descartar(s)"
                [attr.aria-label]="'bandeja.descartarDe' | transloco: { resumen: s.resumen }"
              >
                {{ 'bandeja.descartarBoton' | transloco }}
              </button>
            </div>
          </li>
        } @empty {
          @if (store.estado() === 'listo') {
            <li
              class="rounded-[12px] border border-dashed border-linea bg-superficie px-4 py-10 text-center"
            >
              <p class="m-0 font-semibold">{{ 'bandeja.vaciaTitulo' | transloco }}</p>
              <p class="mt-1 mb-0 text-tinta-suave">{{ 'bandeja.vaciaTexto' | transloco }}</p>
            </li>
          }
        }
      </ul>
    }
  `,
})
export class BandejaPagina {
  protected readonly store = inject(BandejaStore);
  protected readonly formato = inject(Formato);
  private readonly dialogos = inject(Dialogos);
  private readonly avisos = inject(Avisos);
  private readonly router = inject(Router);

  constructor() {
    void this.store.cargar(this.store.estado() === 'listo');
  }

  private contexto(s: SenalPendiente) {
    return {
      resumen: s.asunto || s.resumen,
      ...(s.empresaDetectada ? { empresa: s.empresaDetectada } : {}),
      ...(s.cargoDetectado ? { cargo: s.cargoDetectado } : {}),
    };
  }

  protected async asociar(s: SenalPendiente): Promise<void> {
    const elegidas = await this.dialogos.abrir<string | string[], object>(DialogoAsociar, {
      ...this.contexto(s),
      varias: true,
      marcadas: s.candidatas ?? [],
    });
    const ids = typeof elegidas === 'string' ? [elegidas] : (elegidas ?? []);
    if (!ids.length) return;
    const r = await this.store.asociar(s, ids);
    if (r.ok) this.avisar('bandeja.asociada', r.detalle);
    else this.avisos.error(r.error);
  }

  protected async crear(s: SenalPendiente): Promise<void> {
    const aviso = await this.dialogos.abrir<AvisoEntrada, object>(DialogoCrearDesdeSenal, {
      ...this.contexto(s),
      plataforma: s.plataforma,
    });
    if (!aviso) return;
    const r = await this.store.crear(s, aviso);
    if (r.ok) this.avisar('bandeja.creada', r.detalle);
    else this.avisos.error(r.error);
  }

  protected async descartar(s: SenalPendiente): Promise<void> {
    const si = await this.dialogos.abrir<boolean, object>(DialogoConfirmar, {
      titulo: 'bandeja.descartar.titulo',
      detalle: s.asunto || s.resumen,
      texto: 'bandeja.descartar.texto',
      confirmar: 'bandeja.descartar.confirmar',
    });
    if (!si) return;
    const r = await this.store.descartar(s);
    if (r.ok) this.avisos.exito('bandeja.descartada');
    else this.avisos.error(r.error);
  }

  private avisar(clave: string, d: { id: string; empresa: string; titulo: string }): void {
    this.avisos.exito(
      clave,
      { empresa: d.empresa, titulo: d.titulo },
      { clave: 'tablero.ver', hacer: () => void this.router.navigate(['/postulaciones', d.id]) },
    );
  }
}
