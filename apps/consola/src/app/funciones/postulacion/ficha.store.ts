import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Detalle } from '@brecha/contratos';
import { filter, firstValueFrom, type Observable } from 'rxjs';
import {
  Api,
  type ContactoRed,
  type EditarPaso,
  type EstadoDePaso,
  type InteraccionRed,
  type RegistrarPaso,
} from '../../nucleo/api/api.service';
import { Ia, type AvisoIaDetalle } from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Eventos } from '../../nucleo/eventos/eventos.service';
import { TableroStore } from '../tablero/tablero.store';

/** Cuántos contactos de la red se piden con su conversación completa para la línea de tiempo. */
export const MAXIMO_CONVERSACIONES = 8;

/** Un mensaje o solicitud de LinkedIn con la persona que lo mandó o recibió. */
export interface InteraccionDeContacto {
  contacto: Pick<ContactoRed, 'id' | 'nombre'>;
  i: InteraccionRed;
}

export type EstadoAvisoIa = 'sin_aviso' | 'cargando' | 'listo' | 'apagada' | 'error';

/**
 * Estado de la ficha (ui.md §2 y §4.4). Se refresca sola si llega un evento de esta postulación.
 * Además de la postulación trae con quién hablas (la red de LinkedIn ligada) y, si el aviso viene
 * de Avisos, su análisis de la API de IA. Ninguna de las dos impide ver la ficha si falla.
 */
@Injectable()
export class FichaStore {
  private readonly api = inject(Api);
  private readonly ia = inject(Ia);
  private readonly tablero = inject(TableroStore);
  readonly detalle = signal<Detalle | null>(null);
  readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  readonly error = signal<ErrorDeApi | null>(null);
  readonly ocupado = signal(false);
  readonly discrepanciasAbiertas = computed(
    () => this.detalle()?.discrepancias.filter((d) => d.estado === 'abierta') ?? [],
  );
  /** Personas de tu red ligadas a esta postulación, con lo pendiente primero. */
  readonly red = signal<ContactoRed[]>([]);
  readonly errorRed = signal<ErrorDeApi | null>(null);
  /** Mensajes y solicitudes de esas personas, para la línea de tiempo. */
  readonly conversaciones = signal<InteraccionDeContacto[]>([]);
  readonly avisoIa = signal<AvisoIaDetalle | null>(null);
  readonly estadoAvisoIa = signal<EstadoAvisoIa>('sin_aviso');
  private id = '';
  private avisoPedido = '';

  constructor() {
    inject(Eventos)
      .flujo()
      .pipe(
        filter((e) => (e.datos as { postulacionId?: string }).postulacionId === this.id),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => void this.cargar(this.id, true));
  }

  async cargar(id: string, silencioso = false): Promise<void> {
    this.id = id;
    if (!silencioso) this.estado.set('cargando');
    try {
      const d = await firstValueFrom(this.api.ver(id));
      this.detalle.set(d);
      this.estado.set('listo');
      void this.cargarRed();
      void this.cargarAvisoIa(d.aviso.avisoId);
    } catch (e) {
      if (silencioso) return;
      this.error.set(e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0));
      this.estado.set('error');
    }
  }

  /** Contactos de la red ligados y su conversación (pocas personas por postulación). */
  async cargarRed(): Promise<void> {
    const id = this.id;
    try {
      const r = await firstValueFrom(this.api.red({ postulacionId: id }));
      if (id !== this.id) return;
      this.red.set(r.items);
      this.errorRed.set(null);
      const detalles = await Promise.all(
        r.items
          .slice(0, MAXIMO_CONVERSACIONES)
          .map((c) => firstValueFrom(this.api.verContactoRed(c.id)).catch(() => null)),
      );
      if (id !== this.id) return;
      this.conversaciones.set(
        detalles.flatMap((c) =>
          c ? c.interacciones.map((i) => ({ contacto: { id: c.id, nombre: c.nombre }, i })) : [],
        ),
      );
    } catch (e) {
      if (id !== this.id) return;
      this.errorRed.set(
        e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0),
      );
    }
  }

  /** El análisis del aviso (sueldo publicado, calce y brechas). Sin la API de IA, la ficha sigue. */
  async cargarAvisoIa(avisoId: string | undefined): Promise<void> {
    if (!avisoId) {
      this.avisoPedido = '';
      this.avisoIa.set(null);
      this.estadoAvisoIa.set('sin_aviso');
      return;
    }
    if (avisoId === this.avisoPedido && this.estadoAvisoIa() === 'listo') return;
    this.avisoPedido = avisoId;
    if (!this.avisoIa()) this.estadoAvisoIa.set('cargando');
    try {
      const a = await firstValueFrom(this.ia.aviso(avisoId));
      if (avisoId !== this.avisoPedido) return;
      this.avisoIa.set(a);
      this.estadoAvisoIa.set('listo');
    } catch (e) {
      if (avisoId !== this.avisoPedido) return;
      this.avisoIa.set(null);
      this.estadoAvisoIa.set(
        e instanceof ErrorDeApi && e.codigo === 'IA_APAGADA' ? 'apagada' : 'error',
      );
    }
  }

  /** Corre una acción contra la API y deja la ficha y el tablero con lo que respondió. */
  async ejecutar(accion: (d: Detalle) => Observable<Detalle>): Promise<Detalle> {
    const d = this.detalle();
    if (!d) throw new Error('Sin ficha cargada');
    this.ocupado.set(true);
    try {
      const nuevo = await firstValueFrom(accion(d));
      this.detalle.set(nuevo);
      this.tablero.actualizar(nuevo);
      return nuevo;
    } catch (e) {
      if (e instanceof ErrorDeApi && e.codigo === 'CONFLICTO') await this.cargar(d.id, true);
      throw e;
    } finally {
      this.ocupado.set(false);
    }
  }

  // ── Pasos pendientes (docs/diseno/pasos.md §7.2) ─────────────────────────────

  /** Después de tocar un paso se recargan la ficha y el tablero (el paso puede tocar otras tarjetas). */
  private async tras(accion: Observable<unknown>): Promise<void> {
    await firstValueFrom(accion);
    await this.cargar(this.id, true);
    void this.tablero.cargar(true);
  }

  resolverPaso(pasoId: string, estado: EstadoDePaso): Promise<void> {
    return this.tras(this.api.resolverPaso(pasoId, estado));
  }

  registrarPaso(cuerpo: Omit<RegistrarPaso, 'postulacionIds'>): Promise<void> {
    return this.tras(this.api.registrarPaso({ ...cuerpo, postulacionIds: [this.id] }));
  }

  editarPaso(pasoId: string, cuerpo: EditarPaso): Promise<void> {
    return this.tras(this.api.editarPaso(pasoId, cuerpo));
  }
}
