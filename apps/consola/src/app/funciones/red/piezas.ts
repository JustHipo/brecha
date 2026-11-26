import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ContactoRed, EstadoDeConexion } from '../../nucleo/api/api.service';

/** Quién debe el siguiente mensaje, con texto y no solo color (ui.md §8). */
@Component({
  selector: 'b-pendiente-red',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (contacto().pendiente === 'responder') {
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-[#F3C9B5] bg-[#FDE7DC] px-2 py-[1px] text-xs font-semibold whitespace-nowrap text-[#8A3A1B]"
        data-pendiente="responder"
        ><span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span
        >{{ 'red.pendiente.responder' | transloco }}</span
      >
    } @else if (contacto().pendiente === 'esperando') {
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-linea bg-superficie px-2 py-[1px] text-xs font-semibold whitespace-nowrap text-tinta-suave"
        data-pendiente="esperando"
        ><span class="size-1.5 rounded-full border border-current" aria-hidden="true"></span
        >{{ claveEsperando() | transloco: { n: contacto().diasDesdeUltima } }}</span
      >
    }
  `,
})
export class PendienteRed {
  readonly contacto = input.required<Pick<ContactoRed, 'pendiente' | 'diasDesdeUltima'>>();
  protected readonly claveEsperando = computed(() => {
    const n = this.contacto().diasDesdeUltima;
    if (n === null || n < 1) return 'red.pendiente.esperandoHoy';
    return n === 1 ? 'red.pendiente.esperandoUno' : 'red.pendiente.esperando';
  });
}

const COLORES: Record<EstadoDeConexion, string> = {
  ninguna: 'text-tinta-suave',
  solicitud_enviada: 'text-[#7A5300]',
  solicitud_recibida: 'text-[#8A3A1B]',
  conectados: 'text-[#1D6638]',
  rechazada: 'text-tinta-suave',
  retirada: 'text-tinta-suave',
};

/** Estado de la conexión en LinkedIn. */
@Component({
  selector: 'b-conexion-red',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap' },
  template: `<span
      class="size-2 rounded-full"
      [class]="conexion() === 'conectados' ? 'bg-ok' : 'border border-[#BDB5AB]'"
      aria-hidden="true"
    ></span
    ><span [class]="color()">{{ 'red.conexion.' + conexion() | transloco }}</span>`,
})
export class ConexionRed {
  readonly conexion = input.required<EstadoDeConexion>();
  protected readonly color = computed(() => COLORES[this.conexion()] ?? 'text-tinta-suave');
}

/** Ícono de cada tipo de interacción (el texto va al lado). */
export function iconoInteraccion(tipo: string): string {
  if (tipo === 'mensaje_recibido') return '↙';
  if (tipo === 'mensaje_enviado') return '↗';
  if (tipo === 'nota') return '✎';
  if (tipo === 'conversacion_cerrada') return '✓';
  return '⇄';
}
