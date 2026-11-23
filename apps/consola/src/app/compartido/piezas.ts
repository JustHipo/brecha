import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Plataforma, Prioridad } from '@brecha/contratos';

const COLORES_PLATAFORMA: Record<string, string> = {
  linkedin: 'bg-[var(--plat-linkedin-fondo)] text-[var(--plat-linkedin-tinta)]',
  getonboard: 'bg-[var(--plat-getonboard-fondo)] text-[var(--plat-getonboard-tinta)]',
  trabajando: 'bg-[var(--plat-trabajando-fondo)] text-[var(--plat-trabajando-tinta)]',
  computrabajo: 'bg-[var(--plat-computrabajo-fondo)] text-[var(--plat-computrabajo-tinta)]',
};

/** Etiqueta en mayúsculas de la plataforma (ui.md §7). */
@Component({
  selector: 'b-plataforma',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="etiqueta inline-block rounded-[5px] px-[7px] py-[2px]"
    [class]="clase()"
    >{{ 'plataformas.' + plataforma() | transloco }}</span
  >`,
})
export class EtiquetaPlataforma {
  readonly plataforma = input.required<Plataforma | string>();
  protected readonly clase = computed(
    () =>
      COLORES_PLATAFORMA[this.plataforma()] ??
      'bg-[var(--plat-otra-fondo)] text-[var(--plat-otra-tinta)]',
  );
}

/** Punto de prioridad, siempre con texto al lado (ui.md §8). */
@Component({
  selector: 'b-prioridad',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-[5px] whitespace-nowrap' },
  template: `<span
      class="size-2 rounded-full"
      [class.bg-prioridad-alta]="prioridad() === 'alta'"
      [class.bg-prioridad-media]="prioridad() === 'media'"
      [class.bg-prioridad-baja]="prioridad() === 'baja'"
      aria-hidden="true"
    ></span
    >{{ 'prioridad.' + prioridad() | transloco }}`,
})
export class PuntoPrioridad {
  readonly prioridad = input.required<Prioridad>();
}

const AVATARES = [
  ['#FDE3D3', '#9A3B0C'],
  ['#DDE6FB', '#2A4BB5'],
  ['#E1F1E7', '#1D6638'],
  ['#F1E6FA', '#5B3593'],
  ['#FFF0C2', '#7A5300'],
  ['#E6ECEA', '#24413C'],
] as const;

export function iniciales(empresa: string): string {
  const palabras = empresa
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return palabras
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** Cuadro con las iniciales de la empresa; el color sale del nombre para que sea estable. */
@Component({
  selector: 'b-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'grid flex-none place-items-center font-titulo font-extrabold',
    '[style.background]': 'colores()[0]',
    '[style.color]': 'colores()[1]',
    '[style.width.px]': 'tamano()',
    '[style.height.px]': 'tamano()',
    '[style.border-radius.px]': 'tamano() / 3.5',
    '[style.font-size.px]': 'tamano() / 2.5',
    'aria-hidden': 'true',
  },
  template: `{{ texto() }}`,
})
export class Avatar {
  readonly empresa = input.required<string>();
  readonly tamano = input(32);
  protected readonly texto = computed(() => iniciales(this.empresa()));
  protected readonly colores = computed(() => {
    let h = 0;
    for (const c of this.empresa()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return AVATARES[h % AVATARES.length]!;
  });
}
