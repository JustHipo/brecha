import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Mapa de tus postulaciones por comuna (docs/diseno/arriendos.md §6). */
@Component({
  selector: 'b-mapa-empleo',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `<h1 class="titulo-pagina m-0">{{ 'nav.mapa' | transloco }}</h1>`,
})
export class MapaEmpleoPagina {}
