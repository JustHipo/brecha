import { Injectable, inject, type Type } from '@angular/core';
import { HlmDialogService } from '@brecha/ui/dialog';
import { firstValueFrom } from 'rxjs';

/** Abre un diálogo de Spartan y espera su resultado (undefined si se cancela). */
@Injectable({ providedIn: 'root' })
export class Dialogos {
  private readonly hlm = inject(HlmDialogService);

  abrir<R, C extends object>(componente: Type<unknown>, contexto: C): Promise<R | undefined> {
    const ref = this.hlm.open<R, C>(componente, {
      context: contexto,
      contentClass: 'sm:max-w-[500px] rounded-[16px] p-0 gap-0',
      showCloseButton: false,
    });
    return firstValueFrom(ref.closed$);
  }
}
