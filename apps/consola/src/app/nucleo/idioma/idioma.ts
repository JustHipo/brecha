import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { TranslocoService, type Translation, type TranslocoLoader } from '@jsverse/transloco';

export const IDIOMAS = ['es', 'en'] as const;
export type Idioma = (typeof IDIOMAS)[number];
const CLAVE = 'brecha.idioma';

@Injectable({ providedIn: 'root' })
export class CargadorDeIdioma implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(idioma: string) {
    return this.http.get<Translation>(`/i18n/${idioma}.json`);
  }
}

export function idiomaInicial(): Idioma {
  const guardado = localStorage.getItem(CLAVE);
  return guardado === 'en' ? 'en' : 'es';
}

/** Cambia de idioma en vivo (D24) y formatea fechas y montos con `Intl` según el idioma activo. */
@Injectable({ providedIn: 'root' })
export class Formato {
  private readonly transloco = inject(TranslocoService);

  private get locale(): string {
    return this.transloco.getActiveLang() === 'en' ? 'en-US' : 'es-CL';
  }

  cambiarIdioma(idioma: Idioma): void {
    localStorage.setItem(CLAVE, idioma);
    this.transloco.setActiveLang(idioma);
    document.documentElement.lang = idioma;
  }

  /** Fecha sin hora (`AAAA-MM-DD`) o ISO, como «23-nov». */
  fechaCorta(valor: string | null | undefined): string {
    if (!valor) return '';
    const d = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor);
    return new Intl.DateTimeFormat(this.locale, { day: 'numeric', month: 'short' })
      .format(d)
      .replace('.', '');
  }

  fechaHora(valor: string | null | undefined): string {
    if (!valor) return '';
    return new Intl.DateTimeFormat(this.locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(valor));
  }

  monto(monto: number, moneda: string): string {
    return new Intl.NumberFormat(this.locale, {
      style: 'currency',
      currency: moneda,
      maximumFractionDigits: moneda === 'CLP' ? 0 : 2,
    }).format(monto);
  }

  porcentaje(valor: number): string {
    return new Intl.NumberFormat(this.locale, {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(valor);
  }
}
