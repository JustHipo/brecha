import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Página vacía de una sección de Arriendos mientras no tenga contenido propio. */
@Component({
  selector: 'b-en-preparacion',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 px-6 pt-[22px] pb-10' },
  template: `
    <h1 class="titulo-pagina m-0">{{ titulo | transloco }}</h1>
    <p class="m-0 max-w-[60ch] text-tinta-suave">{{ 'arriendos.vacio' | transloco }}</p>
  `,
})
export class EnPreparacion {
  protected readonly titulo =
    (inject(ActivatedRoute).snapshot.data['titulo'] as string) ?? 'foco.arriendos';
}
