import { Injectable, computed, signal } from '@angular/core';
import { PASOS, type Paso } from './pasos';

/** Clave en localStorage. Subir VERSION hace que el recorrido vuelva a salir una vez (p. ej. con pasos nuevos). */
export const CLAVE_RECORRIDO = 'brecha.recorrido';
export const VERSION_RECORRIDO = '1';

/**
 * Recorrido guiado de la consola: qué paso se muestra y si ya se vio.
 * Se recuerda en localStorage (la consola corre en Electron y en el navegador); si el almacenamiento
 * no está disponible, se recuerda solo mientras la consola siga abierta.
 */
@Injectable({ providedIn: 'root' })
export class RecorridoStore {
  readonly pasos: readonly Paso[] = PASOS;
  readonly total = PASOS.length;
  readonly abierto = signal(false);
  readonly indice = signal(0);
  readonly paso = computed(() => this.pasos[this.indice()]);
  readonly esPrimero = computed(() => this.indice() === 0);
  readonly esUltimo = computed(() => this.indice() === this.total - 1);
  private vistoEnMemoria = false;

  visto(): boolean {
    if (this.vistoEnMemoria) return true;
    try {
      return localStorage.getItem(CLAVE_RECORRIDO) === VERSION_RECORRIDO;
    } catch {
      return false;
    }
  }

  /** Lo llama el marco al abrir la consola: solo arranca si nunca se vio. */
  iniciarSiEsPrimeraVez(): boolean {
    if (this.abierto() || this.visto()) return false;
    this.iniciar();
    return true;
  }

  /** Desde Ajustes o la búsqueda: siempre arranca desde el primer paso. */
  iniciar(): void {
    this.indice.set(0);
    this.abierto.set(true);
  }

  siguiente(): void {
    if (!this.abierto()) return;
    if (this.esUltimo()) this.cerrar();
    else this.indice.update((i) => i + 1);
  }

  atras(): void {
    if (this.abierto() && !this.esPrimero()) this.indice.update((i) => i - 1);
  }

  /** Terminar, saltar o Escape: se cierra y no vuelve a salir solo. */
  cerrar(): void {
    if (!this.abierto()) return;
    this.abierto.set(false);
    this.vistoEnMemoria = true;
    try {
      localStorage.setItem(CLAVE_RECORRIDO, VERSION_RECORRIDO);
    } catch {
      // Sin almacenamiento (modo privado o bloqueado): queda recordado en memoria.
    }
  }
}
