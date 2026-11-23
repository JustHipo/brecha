import { Directive, inject } from '@angular/core';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

export interface ContextoPostulacion {
  empresa: string;
  titulo: string;
}

/** Base de los diálogos: contexto tipado y cierre con resultado. */
@Directive()
export abstract class DialogoBase<C extends object, R> {
  protected readonly ctx = injectBrnDialogContext<C>();
  private readonly ref = inject<BrnDialogRef<R>>(BrnDialogRef);

  protected cerrar(resultado?: R): void {
    this.ref.close(resultado);
  }
}

export function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Clases comunes de los diálogos (maqueta «Marcar como postulada»). */
export const ESTILO = {
  cabecera: 'flex items-start gap-3 px-[22px] pt-5',
  titulo: 'm-0 font-titulo text-xl font-extrabold tracking-[-0.01em]',
  subtitulo: 'mt-0.5 text-tinta-suave',
  cuerpo: 'flex flex-col gap-4 px-[22px] py-[18px]',
  campo: 'flex flex-col gap-1.5',
  etiqueta: 'font-semibold',
  pie: 'flex items-center gap-2.5 border-t border-linea px-[22px] py-3.5',
  ayuda: 'rounded-[10px] bg-superficie px-3 py-2.5 text-[12.5px] text-[#5E5751]',
  error: 'text-[12.5px] text-error',
  chip: 'h-[34px] rounded-full px-3.5 border',
};
