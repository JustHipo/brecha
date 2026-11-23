import { Injectable, signal } from '@angular/core';

const CLAVE = 'brecha.sesion';

/** Token de sesión entregado al desbloquear (solo con clave local). Vive en sessionStorage. */
@Injectable({ providedIn: 'root' })
export class SesionLocal {
  private readonly token = signal<string | null>(this.leer());

  actual(): string | null {
    const t = this.token();
    return t;
  }

  guardar(token: string, expiraEn: string): void {
    sessionStorage.setItem(CLAVE, JSON.stringify({ token, expiraEn }));
    this.token.set(token);
  }

  olvidar(): void {
    sessionStorage.removeItem(CLAVE);
    this.token.set(null);
  }

  private leer(): string | null {
    try {
      const v = JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null') as {
        token: string;
        expiraEn: string;
      } | null;
      if (!v || Date.parse(v.expiraEn) < Date.now()) return null;
      return v.token;
    } catch {
      return null;
    }
  }
}
