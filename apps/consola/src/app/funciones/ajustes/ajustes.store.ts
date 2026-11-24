import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import {
  Ia,
  type CredencialGuardada,
  type Credenciales,
  type TipoDeCredencial,
} from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { EstadoIaStore } from '../conexiones/estado-ia.store';

export type Operacion = 'quieta' | 'probando' | 'borrando';

/** Lo que pasó con el último Guardar o Borrar de una credencial. */
export type Resultado =
  | { tipo: 'guardada' }
  | { tipo: 'borrada' }
  /** `mensaje` es el del servidor cuando la credencial no pasó la prueba (CREDENCIAL_INVALIDA). */
  | { tipo: 'error'; error: ErrorDeApi; mensaje: string | null };

function aError(e: unknown): ErrorDeApi {
  return e instanceof ErrorDeApi ? e : new ErrorDeApi('IA_APAGADA', String(e), 0);
}

const QUIETAS: Record<TipoDeCredencial, Operacion> = { correo: 'quieta', openai: 'quieta' };
const SIN_RESULTADO: Record<TipoDeCredencial, Resultado | null> = { correo: null, openai: null };

/**
 * Ajustes (ui.md §5, F3): credenciales de Gmail y OpenAI. La API de IA las prueba antes de
 * guardarlas, las deja en el llavero del sistema y nunca las devuelve: aquí solo se ve si están y
 * el usuario del correo enmascarado.
 */
@Injectable()
export class AjustesStore {
  private readonly ia = inject(Ia);
  private readonly estadoIa = inject(EstadoIaStore);

  readonly credenciales = signal<Credenciales | null>(null);
  readonly error = signal<ErrorDeApi | null>(null);
  readonly cargando = signal(false);
  readonly operacion = signal<Record<TipoDeCredencial, Operacion>>(QUIETAS);
  readonly resultado = signal<Record<TipoDeCredencial, Resultado | null>>(SIN_RESULTADO);

  /** El servicio con IA no responde: no se puede guardar nada. */
  readonly apagada = computed(() => this.error()?.codigo === 'IA_APAGADA');
  /** Cada cuántos minutos revisa el correo el vigía (sale de Conexiones). */
  readonly vigiaMinutos = computed(() => this.estadoIa.conexiones()?.correo.cadaMinutos ?? null);

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.credenciales.set(await firstValueFrom(this.ia.credenciales()));
      this.error.set(null);
    } catch (e) {
      this.error.set(aError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  guardarCorreo(usuario: string, clave: string): Promise<boolean> {
    return this.ejecutar('correo', 'probando', this.ia.guardarCorreo(usuario.trim(), clave));
  }

  guardarOpenai(llave: string): Promise<boolean> {
    return this.ejecutar('openai', 'probando', this.ia.guardarOpenai(llave.trim()));
  }

  borrar(tipo: TipoDeCredencial): Promise<boolean> {
    return this.ejecutar(tipo, 'borrando', this.ia.borrarCredencial(tipo));
  }

  private async ejecutar(
    tipo: TipoDeCredencial,
    operacion: Exclude<Operacion, 'quieta'>,
    llamada: Observable<CredencialGuardada | void>,
  ): Promise<boolean> {
    this.operacion.update((o) => ({ ...o, [tipo]: operacion }));
    this.resultado.update((r) => ({ ...r, [tipo]: null }));
    try {
      await firstValueFrom(llamada, { defaultValue: undefined });
      this.resultado.update((r) => ({
        ...r,
        [tipo]: { tipo: operacion === 'probando' ? 'guardada' : 'borrada' },
      }));
      await this.cargar();
      void this.estadoIa.cargar();
      return true;
    } catch (e) {
      const error = aError(e);
      const mensaje = error.codigo === 'CREDENCIAL_INVALIDA' ? error.message || null : null;
      this.resultado.update((r) => ({ ...r, [tipo]: { tipo: 'error', error, mensaje } }));
      return false;
    } finally {
      this.operacion.update((o) => ({ ...o, [tipo]: 'quieta' }));
    }
  }
}
