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

/** Etiquetas de una postulación como «#investigacion» (csv.md §7). */
@Component({
  selector: 'b-etiquetas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap gap-1' },
  template: `@for (e of etiquetas(); track e) {
    <span
      class="rounded-full border border-linea bg-superficie px-2 py-[1px] text-[11.5px] font-medium text-tinta-suave"
      >#{{ e }}</span
    >
  }`,
})
export class Etiquetas {
  readonly etiquetas = input.required<readonly string[]>();
}

/** Una herramienta pedida por el aviso y si la tienes, con o sin los años pedidos. */
export interface HerramientaPedida {
  nombre: string;
  obligatorio: boolean;
  /** `si`: la tienes; `falta`: no está en tu perfil; `menos`: la tienes con menos años; `sin_dato`: sin perfil o sin análisis. */
  estado: 'si' | 'falta' | 'menos' | 'sin_dato';
  detalle?: string;
}

/**
 * Lista de herramientas del aviso (csv.md §7): las que faltan en tu perfil van en rojo con ✕ y la palabra
 * «falta»; las que tienes, normales con ✓. El color nunca es el único indicador (ui.md §8).
 */
@Component({
  selector: 'b-stack',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<ul
    class="m-0 flex list-none flex-wrap gap-1.5 p-0"
    [attr.aria-label]="'stack.titulo' | transloco"
  >
    @for (h of visibles(); track h.nombre) {
      <li
        class="inline-flex items-center gap-1 rounded-full border px-2.5 py-[2px] text-[12.5px] font-semibold"
        [class]="clase(h)"
        [attr.data-herramienta]="h.nombre"
        [attr.data-estado]="h.estado"
      >
        @switch (h.estado) {
          @case ('falta') {
            <span aria-hidden="true">✕</span>{{ h.nombre }}
            <span class="font-normal">· {{ 'stack.falta' | transloco }}</span>
          }
          @case ('menos') {
            <span aria-hidden="true">✕</span>{{ h.nombre }}
            <span class="font-normal">· {{ h.detalle }}</span>
          }
          @case ('si') {
            <span aria-hidden="true">✓</span>{{ h.nombre }}
            <span class="solo-lector">({{ 'stack.tienes' | transloco }})</span>
          }
          @default {
            {{ h.nombre }}
          }
        }
        @if (!h.obligatorio) {
          <span class="font-normal text-tinta-suave">· {{ 'stack.deseable' | transloco }}</span>
        }
      </li>
    }
    @if (ocultas() > 0) {
      <li class="inline-flex items-center px-1 text-[12.5px] text-tinta-suave">+{{ ocultas() }}</li>
    }
  </ul>`,
})
export class ListaStack {
  readonly herramientas = input.required<readonly HerramientaPedida[]>();
  /** Cuántas mostrar antes de «+N» (la tarjeta de Avisos muestra pocas). */
  readonly maximo = input<number>(Infinity);
  protected readonly visibles = computed(() => this.herramientas().slice(0, this.maximo()));
  protected readonly ocultas = computed(() =>
    Math.max(0, this.herramientas().length - this.maximo()),
  );
  protected clase(h: HerramientaPedida): string {
    return h.estado === 'falta' || h.estado === 'menos'
      ? 'border-brecha bg-brecha-fondo text-brecha'
      : 'border-linea bg-superficie text-tinta';
  }
}

/**
 * Arma la lista de herramientas desde el análisis del servicio con IA: requisitos (en su orden), `cumple` y
 * `brechas` (las con menos años vienen como «Python (1 de 3 años)»). Sin análisis, el stack del núcleo sin colores.
 */
export function herramientasPedidas(
  analisis: {
    requisitos?: { nombre: string; obligatorio: boolean }[];
    cumple?: string[];
    brechas: string[];
  } | null,
  stackDelNucleo: readonly string[],
  hayCalce: boolean,
): HerramientaPedida[] {
  const requisitos = analisis?.requisitos ?? [];
  if (!analisis || !requisitos.length || !hayCalce) {
    const nombres = requisitos.length ? requisitos.map((r) => r.nombre) : stackDelNucleo;
    return nombres.map((nombre) => ({ nombre, obligatorio: true, estado: 'sin_dato' }));
  }
  const cumple = new Set((analisis.cumple ?? []).map((x) => x.toLowerCase()));
  const faltan = new Set(
    analisis.brechas.filter((b) => !b.includes('(')).map((x) => x.toLowerCase()),
  );
  const conMenos = new Map(
    analisis.brechas
      .map((b) => /^(.*) \((.*)\)$/.exec(b))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1]!.toLowerCase(), m[2]!] as const),
  );
  return requisitos.map((r) => {
    const k = r.nombre.toLowerCase();
    if (conMenos.has(k)) return { ...r, estado: 'menos', detalle: conMenos.get(k)! };
    if (faltan.has(k)) return { ...r, estado: 'falta' };
    if (cumple.has(k)) return { ...r, estado: 'si' };
    return { ...r, estado: 'sin_dato' };
  });
}

/**
 * Para la tarjeta de Avisos, que solo trae `stack`, `brechas` y `calce`: lo del stack que está en las brechas
 * va como falta; las brechas que no estaban en el stack se suman al final.
 */
export function herramientasDeTarjeta(a: {
  stack: string[];
  brechas: string[];
  calce: number | null;
}): HerramientaPedida[] {
  const brechas = a.brechas.map((b) => {
    const m = /^(.*) \((.*)\)$/.exec(b);
    return { nombre: (m?.[1] ?? b).trim(), detalle: m?.[2] };
  });
  const de = (h: string) => brechas.find((b) => b.nombre.toLowerCase() === h.toLowerCase());
  const delStack: HerramientaPedida[] = a.stack.map((nombre) => {
    const b = de(nombre);
    if (b?.detalle) return { nombre, obligatorio: true, estado: 'menos', detalle: b.detalle };
    if (b) return { nombre, obligatorio: true, estado: 'falta' };
    return { nombre, obligatorio: true, estado: a.calce === null ? 'sin_dato' : 'si' };
  });
  const extra: HerramientaPedida[] = brechas
    .filter((b) => !a.stack.some((h) => h.toLowerCase() === b.nombre.toLowerCase()))
    .map((b) =>
      b.detalle
        ? { nombre: b.nombre, obligatorio: true, estado: 'menos', detalle: b.detalle }
        : { nombre: b.nombre, obligatorio: true, estado: 'falta' },
    );
  return [...delStack, ...extra];
}
