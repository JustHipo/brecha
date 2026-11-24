import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { HlmInput } from '@brecha/ui/input';
import type {
  CambiarEstadoPropiedad,
  EstadoPropiedad,
  Propiedad,
} from '../../nucleo/api/arriendos.api';
import { PIDEN_MOTIVO } from './arriendos.store';

const CLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/** «$550.000»; «UF 15,5»; «—» si no hay. */
export function pesos(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : CLP.format(n);
}

export function precioTexto(p: Pick<Propiedad, 'precio' | 'precioPesos'>): string {
  if (!p.precio) return '—';
  if (p.precio.moneda === 'UF') {
    const uf = `UF ${p.precio.monto.toLocaleString('es-CL')}`;
    return p.precioPesos ? `${uf} (${pesos(p.precioPesos)})` : uf;
  }
  return pesos(p.precio.monto);
}

/** Puntaje del calce contra tus reglas: verde si calza, ámbar a medias, rojo si falla una regla dura. */
@Component({
  selector: 'b-calce-arriendo',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = calce();
    @if (c.puntaje === null) {
      <span
        class="rounded-full border border-linea px-2 py-px text-[11.5px] text-tinta-suave"
        [attr.title]="'arriendos.calceSinDatos' | transloco"
        >{{ 'arriendos.calceSd' | transloco }}</span
      >
    } @else {
      <span
        class="rounded-full px-2 py-px text-[11.5px] font-bold tabular-nums"
        [class]="clase()"
        [attr.title]="c.brechas[0]?.texto ?? ('arriendos.calceCumple' | transloco)"
        >{{
          c.cumpleDuras
            ? ('arriendos.calce' | transloco: { n: c.puntaje })
            : ('arriendos.noCumple' | transloco)
        }}</span
      >
    }
  `,
})
export class CalceArriendo {
  readonly calce = input.required<Propiedad['calce']>();
  protected readonly clase = computed(() => {
    const c = this.calce();
    if (!c.cumpleDuras) return 'bg-[#FBE3E1] text-error';
    if ((c.puntaje ?? 0) >= 75) return 'bg-[#DFF3E8] text-[#1F6B47]';
    return 'bg-aviso-fondo text-aviso-tinta';
  });
}

/**
 * Lo que falta para mover (P6): motivo para cerrar, fecha y hora de la visita, documentos enviados.
 * Un `<dialog>` nativo: Escape cancela y el foco vuelve solo al botón que lo abrió.
 */
@Component({
  selector: 'b-dialogo-mover',
  imports: [TranslocoPipe, FormsModule, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialogo
      class="m-auto w-[440px] max-w-[92vw] rounded-2xl border border-linea bg-fondo p-0 text-tinta shadow-[0_20px_50px_rgb(38_33_30/0.22)] backdrop:bg-[rgb(38_33_30/0.42)]"
      (close)="cerrado()"
      aria-labelledby="mover-titulo"
    >
      <form class="flex flex-col gap-3 p-5" (submit)="$event.preventDefault(); confirmar()">
        <h2 id="mover-titulo" class="m-0 text-lg font-extrabold">
          {{
            'arriendos.moverA' | transloco: { estado: ('estadosArriendo.' + destino() | transloco) }
          }}
        </h2>
        @if (pideMotivo()) {
          <label class="flex flex-col gap-1">
            <span class="font-semibold">{{ 'arriendos.motivo' | transloco }}</span>
            <textarea
              hlmInput
              name="motivo"
              required
              class="min-h-20"
              [(ngModel)]="motivo"
              data-campo-motivo
            ></textarea>
          </label>
        }
        @if (destino() === 'visita_agendada') {
          <label class="flex flex-col gap-1">
            <span class="font-semibold">{{ 'arriendos.fechaVisita' | transloco }}</span>
            <input
              hlmInput
              type="datetime-local"
              name="fecha"
              required
              [(ngModel)]="fecha"
              data-campo-fecha
            />
          </label>
        }
        @if (destino() === 'en_evaluacion') {
          <label class="flex flex-col gap-1">
            <span class="font-semibold">{{ 'arriendos.documentosEnviados' | transloco }}</span>
            <input
              hlmInput
              name="documentos"
              [(ngModel)]="documentos"
              [placeholder]="'arriendos.documentosEjemplo' | transloco"
            />
          </label>
        }
        <div class="flex justify-end gap-2">
          <button hlmBtn variant="ghost" type="button" (click)="cancelar()">
            {{ 'dialogos.cancelar' | transloco }}
          </button>
          <button hlmBtn type="submit" [disabled]="!valido()">
            {{ 'arriendos.mover' | transloco }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class DialogoMover {
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly destino = signal<EstadoPropiedad>('vista');
  protected motivo = '';
  protected fecha = '';
  protected documentos = '';
  private resolver?: (v: CambiarEstadoPropiedad | null) => void;

  protected readonly pideMotivo = computed(() => PIDEN_MOTIVO.includes(this.destino()));

  protected valido(): boolean {
    if (this.pideMotivo() && !this.motivo.trim()) return false;
    if (this.destino() === 'visita_agendada' && !this.fecha) return false;
    return true;
  }

  /** Si el destino no pide nada, responde al tiro sin abrir el diálogo. */
  pedir(a: EstadoPropiedad): Promise<CambiarEstadoPropiedad | null> {
    if (!PIDEN_MOTIVO.includes(a) && a !== 'visita_agendada' && a !== 'en_evaluacion')
      return Promise.resolve({ a });
    this.destino.set(a);
    this.motivo = '';
    this.fecha = '';
    this.documentos = '';
    this.dialogo().nativeElement.showModal();
    return new Promise((r) => (this.resolver = r));
  }

  protected confirmar(): void {
    if (!this.valido()) return;
    const a = this.destino();
    const docs = this.documentos
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    this.resolver?.({
      a,
      ...(this.pideMotivo() ? { motivo: this.motivo.trim() } : {}),
      ...(a === 'visita_agendada' ? { fechaVisita: new Date(this.fecha).toISOString() } : {}),
      ...(a === 'en_evaluacion' && docs.length ? { documentos: docs } : {}),
    });
    this.resolver = undefined;
    this.dialogo().nativeElement.close();
  }

  protected cancelar(): void {
    this.dialogo().nativeElement.close();
  }

  protected cerrado(): void {
    this.resolver?.(null);
    this.resolver = undefined;
  }
}
