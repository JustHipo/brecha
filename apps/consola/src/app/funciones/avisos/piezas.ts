import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { AvisoIa } from '../../nucleo/api/ia.service';

/** Insignia del calce (0 a 100) con texto, no solo color (ui.md §8). */
@Component({
  selector: 'b-calce',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `<span
    class="inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-xs font-semibold whitespace-nowrap tabular-nums"
    [class]="clase()"
  >
    @if (calce() === null) {
      {{ (analizado() ? 'avisos.sinCalce' : 'avisos.porAnalizar') | transloco }}
    } @else {
      {{ 'avisos.calce' | transloco: { n: calce() } }}
    }
  </span>`,
})
export class InsigniaCalce {
  readonly calce = input<number | null>(null);
  readonly analizado = input(false);
  protected readonly clase = computed(() => {
    const c = this.calce();
    if (c === null) return 'border-linea bg-superficie text-tinta-suave';
    if (c >= 70) return 'border-[#BFE3CF] bg-[#E3F2E8] text-[#1D6638]';
    if (c >= 40) return 'border-aviso-borde bg-aviso-fondo text-aviso-tinta';
    return 'border-linea bg-[#F6E7E1] text-[#8A3A1B]';
  });
}

/** Cita del aviso y enlace al original: siempre visibles (Get on Board pide citar la fuente). */
@Component({
  selector: 'b-cita',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-tinta-suave' },
  template: `
    <span>{{ aviso().cita || ('avisos.origenes.' + aviso().origen | transloco) }}</span>
    <span aria-hidden="true">·</span>
    <a
      [href]="aviso().url"
      target="_blank"
      rel="noopener noreferrer"
      class="font-semibold text-acento underline-offset-2 hover:underline"
      >{{ 'avisos.verOriginal' | transloco
      }}<span class="solo-lector">
        ({{ aviso().empresa }}, {{ 'avisos.nuevaVentana' | transloco }})</span
      ></a
    >
  `,
})
export class CitaAviso {
  readonly aviso = input.required<Pick<AvisoIa, 'cita' | 'origen' | 'url' | 'empresa'>>();
}
