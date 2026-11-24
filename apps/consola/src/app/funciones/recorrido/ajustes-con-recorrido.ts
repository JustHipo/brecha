import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton } from '@brecha/ui/button';
import { AjustesPagina } from '../ajustes/ajustes';
import { RecorridoStore } from './recorrido.store';

/**
 * Ajustes con la tarjeta «Recorrido guiado» al final. Envuelve la pantalla de Ajustes desde la ruta
 * para no tocar `ajustes.ts` mientras otra rama la cambia; al juntar las ramas, la tarjeta puede
 * pasar adentro de esa pantalla y esta envoltura desaparecer.
 */
@Component({
  selector: 'b-ajustes-con-recorrido',
  imports: [AjustesPagina, TranslocoPipe, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col' },
  template: `
    <b-ajustes />
    <section
      class="mx-6 -mt-6 mb-10 flex max-w-3xl flex-col gap-3 rounded-[12px] border border-linea bg-fondo px-5 py-4 shadow-tarjeta"
      aria-labelledby="aj-recorrido"
    >
      <h2 id="aj-recorrido" class="m-0 text-lg font-extrabold">
        {{ 'recorrido.enAjustes.titulo' | transloco }}
      </h2>
      <p class="m-0 text-[12.5px] text-[#4A4440]">
        {{ 'recorrido.enAjustes.texto' | transloco }}
      </p>
      <div>
        <button hlmBtn variant="outline" type="button" (click)="recorrido.iniciar()">
          {{ 'recorrido.enAjustes.ver' | transloco }}
        </button>
      </div>
    </section>
  `,
})
export class AjustesConRecorrido {
  protected readonly recorrido = inject(RecorridoStore);
}
