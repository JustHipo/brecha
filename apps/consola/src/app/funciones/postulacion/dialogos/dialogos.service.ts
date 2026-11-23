import { Dialog } from '@angular/cdk/dialog';
import { Injectable, inject, type Type } from '@angular/core';
import { HlmDialogService } from '@brecha/ui/dialog';
import { firstValueFrom } from 'rxjs';

/** Abre un diálogo de Spartan y espera su resultado (undefined si se cancela). */
@Injectable({ providedIn: 'root' })
export class Dialogos {
  private readonly hlm = inject(HlmDialogService);
  private readonly cdk = inject(Dialog);

  async abrir<R, C extends object>(componente: Type<unknown>, contexto: C): Promise<R | undefined> {
    // Si viene justo después de otro diálogo (Mover a… y después Motivo), espera a que el anterior
    // termine de cerrarse: abrirlo encima deja al segundo sin poder cerrar.
    if (this.cdk.openDialogs.length) await firstValueFrom(this.cdk.afterAllClosed);
    const ref = this.hlm.open<R, C>(componente, {
      context: contexto,
      contentClass: 'sm:max-w-[500px] rounded-[16px] p-0 gap-0',
      showCloseButton: false,
    });
    return firstValueFrom(ref.closed$);
  }
}
