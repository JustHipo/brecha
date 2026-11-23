import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { EstadoPostulacion } from '@brecha/contratos';
import { HlmButton } from '@brecha/ui/button';
import { DialogoBase, ESTILO, type ContextoPostulacion } from './base';

/** «Mover a…» con teclado: solo los destinos de transicionesPosibles (ui.md §4.2). */
@Component({
  selector: 'b-dialogo-mover',
  imports: [TranslocoPipe, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="e.cabecera">
      <div class="flex-1">
        <h2 [class]="e.titulo">{{ ctx.tituloClave ?? 'mover.titulo' | transloco }}</h2>
        <p [class]="e.subtitulo">{{ ctx.empresa }} · {{ ctx.titulo }}</p>
      </div>
    </div>
    <div [class]="e.cuerpo">
      <p class="m-0 text-tinta-suave">
        {{ 'mover.descripcion' | transloco: { estado: ('estados.' + ctx.estado | transloco) } }}
      </p>
      <div class="flex flex-col gap-2">
        @for (d of ctx.destinos; track d; let primero = $first) {
          <button
            hlmBtn
            variant="outline"
            class="justify-start"
            type="button"
            (click)="cerrar(d)"
            [attr.cdkFocusInitial]="primero ? '' : null"
          >
            {{ 'estados.' + d | transloco }}
          </button>
        } @empty {
          <p class="m-0">{{ 'mover.ninguno' | transloco }}</p>
        }
      </div>
    </div>
    <div [class]="e.pie">
      <span class="flex-1"></span>
      <button hlmBtn variant="outline" type="button" (click)="cerrar()">
        {{ 'mover.cancelar' | transloco }}
      </button>
    </div>
  `,
})
export class DialogoMover extends DialogoBase<
  ContextoPostulacion & {
    estado: EstadoPostulacion;
    destinos: EstadoPostulacion[];
    tituloClave?: string;
  },
  EstadoPostulacion
> {
  protected readonly e = ESTILO;
}
