import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Los focos de Brecha (docs/diseno/arriendos.md §1): qué estás mirando. Los dos corren siempre. */
export const FOCOS = ['empleo', 'arriendos'] as const;
export type FocoId = (typeof FOCOS)[number];

export const INICIO: Record<FocoId, string> = {
  empleo: '/tablero',
  arriendos: '/arriendos/tablero',
};

/** Rutas que no son de un foco (Ajustes, Conexiones): al entrar a ellas no cambia el foco. */
const COMPARTIDAS = ['/ajustes', '/conexiones', '/desbloquear'];

const CLAVE = 'brecha.foco';

/** El foco sale de la URL (A-D3): `/arriendos/...` es Arriendos; las compartidas no deciden; el resto es Empleo. */
export function focoDeUrl(url: string): FocoId | null {
  const ruta = url.split(/[?#]/)[0] ?? '';
  if (ruta === '/arriendos' || ruta.startsWith('/arriendos/')) return 'arriendos';
  if (COMPARTIDAS.some((c) => ruta === c || ruta.startsWith(`${c}/`))) return null;
  return 'empleo';
}

interface Guardado {
  foco: FocoId;
  rutas: Partial<Record<FocoId, string>>;
}

function leer(): Guardado {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Partial<Guardado> | null;
    const foco = v && FOCOS.includes(v.foco as FocoId) ? (v.foco as FocoId) : 'empleo';
    const rutas: Partial<Record<FocoId, string>> = {};
    for (const f of FOCOS) {
      const r = v?.rutas?.[f];
      if (typeof r === 'string' && r.startsWith('/') && focoDeUrl(r) === f) rutas[f] = r;
    }
    return { foco, rutas };
  } catch {
    return { foco: 'empleo', rutas: {} };
  }
}

/**
 * Foco activo y la última ruta de cada foco, para volver donde estabas al cambiar.
 * Pinta `data-foco` en `<html>`: el color de la barra lateral sale de ahí (styles.css).
 */
@Injectable({ providedIn: 'root' })
export class Foco {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly guardado = leer();
  readonly actual = signal<FocoId>(this.guardado.foco);

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const url = e.urlAfterRedirects;
      const f = focoDeUrl(url);
      if (!f) return;
      this.actual.set(f);
      this.guardado.rutas[f] = url;
      this.guardar();
    });
    effect(() => {
      const f = this.actual();
      this.doc.documentElement.dataset['foco'] = f;
      this.guardado.foco = f;
      this.guardar();
    });
  }

  /** La ruta para abrir la app: el inicio del último foco que usaste. */
  inicioRecordado(): string {
    return INICIO[this.guardado.foco];
  }

  /** Cambia de foco y vuelve a la última pantalla que tenías abierta en él. */
  cambiar(f: FocoId): void {
    if (f === this.actual() && focoDeUrl(this.router.url) === f) return;
    this.actual.set(f);
    void this.router.navigateByUrl(this.guardado.rutas[f] ?? INICIO[f]);
  }

  private guardar(): void {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(this.guardado));
    } catch {
      // Sin almacenamiento (ventana privada): el foco vale solo en esta sesión.
    }
  }
}
