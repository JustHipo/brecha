import { CdkMenuModule } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Resumen } from '@brecha/contratos';
import { HlmDropdownMenuImports } from '@brecha/ui/dropdown-menu';
import { Avatar, EtiquetaPlataforma, Etiquetas, PuntoPrioridad } from '../../compartido/piezas';

const I = {
  reloj: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  correo: 'M3 6h18v12H3zM3 7l9 6 9-6',
  envio: 'M4 12l16-8-6 16-3-7z',
};

/** Tarjeta del tablero (ui.md §4.2, maqueta «Cálida»). Enter abre la ficha; M abre «Mover a…». */
@Component({
  selector: 'b-tarjeta',
  imports: [
    RouterLink,
    TranslocoPipe,
    Avatar,
    EtiquetaPlataforma,
    Etiquetas,
    PuntoPrioridad,
    CdkMenuModule,
    HlmDropdownMenuImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let t = tarjeta();
    <article
      class="relative flex flex-col gap-[9px] overflow-hidden rounded-[12px] border bg-fondo px-[13px] pt-3 shadow-tarjeta"
      [class.border-linea]="!t.discrepanciasAbiertas"
      [class.border-aviso-borde]="t.discrepanciasAbiertas"
      [class.pb-3]="!t.discrepanciasAbiertas"
      [attr.data-tarjeta]="t.id"
    >
      <div class="flex items-center gap-1.5">
        <b-plataforma [plataforma]="t.plataforma" />
        <b-prioridad class="ml-auto text-[11.5px] text-tinta-suave" [prioridad]="t.prioridad" />
        <button
          type="button"
          class="relative z-10 -mr-1 grid size-7 place-items-center rounded-md text-tinta-suave hover:bg-superficie"
          [attr.aria-label]="'tablero.acciones' | transloco: { empresa: t.empresa }"
          [cdkMenuTriggerFor]="menu"
        >
          <span aria-hidden="true" class="tracking-[1px]">···</span>
        </button>
      </div>
      <a
        [routerLink]="['/postulaciones', t.id]"
        class="flex items-center gap-2.5 rounded-md text-tinta no-underline after:absolute after:inset-0 after:content-['']"
        (keydown.m)="mover.emit(t); $event.preventDefault()"
      >
        <b-avatar [empresa]="t.empresa" />
        <span class="flex min-w-0 flex-col">
          <span class="text-sm leading-tight font-bold">{{ t.titulo }}</span>
          <span class="text-[12.5px] text-tinta-suave">{{ t.empresa }}</span>
        </span>
      </a>
      <div class="flex flex-col gap-1">
        @if (cierre(); as c) {
          <span
            class="flex items-center gap-[7px] text-[12.5px]"
            [class.text-prioridad-alta]="c.pronto"
            [class.font-semibold]="c.pronto"
            [class.text-tinta-suave]="!c.pronto"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              aria-hidden="true"
            >
              <path [attr.d]="iconos.reloj"></path>
            </svg>
            {{ c.clave | transloco: { n: t.diasAlCierre } }}
          </span>
        }
        @if (t.senalesNuevas) {
          <span class="flex items-center gap-[7px] text-[12.5px] font-semibold text-acento">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              aria-hidden="true"
            >
              <path [attr.d]="iconos.correo"></path>
            </svg>
            {{ 'tablero.senalesNuevas' | transloco: { n: t.senalesNuevas } }}
          </span>
        }
        @if (t.fechaPostulacion) {
          <span class="flex items-center gap-[7px] text-[12.5px] text-tinta-suave">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              aria-hidden="true"
            >
              <path [attr.d]="iconos.envio"></path>
            </svg>
            {{ 'tablero.postuladaEl' | transloco: { fecha: fechaCorta()(t.fechaPostulacion) } }}
          </span>
        }
      </div>
      @if (t.etiquetas.length) {
        <b-etiquetas [etiquetas]="t.etiquetas" />
      }
      @if (t.discrepanciasAbiertas) {
        <p
          class="-mx-[13px] mt-0 mb-0 flex items-start gap-[7px] border-t border-aviso-borde bg-aviso-fondo px-[13px] py-[9px] text-[12.5px] font-semibold text-aviso-tinta"
        >
          <span aria-hidden="true">⚠</span>{{ 'tablero.discrepancia' | transloco }}
        </p>
      }
    </article>

    <ng-template #menu>
      <div hlmDropdownMenu class="w-48">
        <button
          hlmDropdownMenuItem
          (triggered)="mover.emit(t)"
          [disabled]="!t.transicionesPosibles.length"
        >
          {{ 'tablero.moverA' | transloco }}
        </button>
        <a hlmDropdownMenuItem [href]="t.url" target="_blank" rel="noopener noreferrer"
          >{{ 'tablero.abrirAviso' | transloco }} ↗</a
        >
        <a hlmDropdownMenuItem [routerLink]="['/postulaciones', t.id]" [fragment]="'nota'">{{
          'tablero.agregarNota' | transloco
        }}</a>
      </div>
    </ng-template>
  `,
})
export class Tarjeta {
  readonly tarjeta = input.required<Resumen>();
  readonly fechaCorta = input.required<(f: string) => string>();
  readonly mover = output<Resumen>();
  protected readonly iconos = I;

  protected readonly cierre = computed(() => {
    const d = this.tarjeta().diasAlCierre;
    if (d === null || d === undefined) return null;
    if (d < 0) return { clave: 'tablero.cerro', pronto: false };
    if (d === 0) return { clave: 'tablero.cierraHoy', pronto: true };
    if (d === 1) return { clave: 'tablero.cierraManana', pronto: true };
    return { clave: 'tablero.cierraEn', pronto: d <= 2 };
  });
}
