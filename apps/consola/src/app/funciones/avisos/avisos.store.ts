import { Injectable, inject, signal } from '@angular/core';
import type { CrearPostulacion } from '@brecha/contratos';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../nucleo/api/api.service';
import {
  Ia,
  type AvisoIa,
  type AvisoIaDetalle,
  type ConteoAvisos,
  type FiltrosAvisos,
} from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { TableroStore } from '../tablero/tablero.store';

type Plataforma = CrearPostulacion['aviso']['plataforma'];
type Modalidad = NonNullable<CrearPostulacion['aviso']['modalidad']>;

const PLATAFORMAS: readonly Plataforma[] = [
  'linkedin',
  'trabajando',
  'getonboard',
  'computrabajo',
  'chiletrabajos',
  'indeed',
  'sitio_empresa',
  'otra',
];
const MODALIDADES: readonly Modalidad[] = ['remoto', 'hibrido', 'presencial', 'no_indica'];

function aError(e: unknown): ErrorDeApi {
  return e instanceof ErrorDeApi ? e : new ErrorDeApi('ERROR_INTERNO', String(e), 0);
}

/** El aviso de la IA con las claves que entiende el núcleo (las desconocidas van a `otra` y `no_indica`). */
export function aPostulacion(a: AvisoIa): CrearPostulacion {
  const plataforma = (PLATAFORMAS as readonly string[]).includes(a.plataforma)
    ? (a.plataforma as Plataforma)
    : 'otra';
  const modalidad = (MODALIDADES as readonly string[]).includes(a.modalidad)
    ? (a.modalidad as Modalidad)
    : 'no_indica';
  return {
    aviso: {
      titulo: a.titulo.slice(0, 300),
      empresa: a.empresa.slice(0, 200),
      url: a.url,
      plataforma,
      modalidad,
      ...(a.ubicacion ? { ubicacion: a.ubicacion.slice(0, 200) } : {}),
    },
  };
}

export type ResultadoSeguir =
  | { ok: true; postulacionId: string; yaExistia: boolean }
  | { ok: false; error: ErrorDeApi; postulacionId?: string };

/** Avisos (f2.md §8): lista con filtros y «Seguir», que crea la postulación en el núcleo y la liga. */
@Injectable({ providedIn: 'root' })
export class AvisosStore {
  private readonly ia = inject(Ia);
  private readonly api = inject(Api);
  private readonly tablero = inject(TableroStore);

  readonly items = signal<AvisoIa[]>([]);
  readonly conteo = signal<ConteoAvisos | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<ErrorDeApi | null>(null);
  readonly filtros = signal<FiltrosAvisos>({});
  readonly siguiendo = signal<ReadonlySet<string>>(new Set());

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await firstValueFrom(this.ia.avisos(this.filtros()));
      this.items.set(r.items);
      this.conteo.set(r.conteo);
      this.error.set(null);
    } catch (e) {
      this.error.set(aError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /**
   * Crea la postulación (o usa la que ya sigue ese aviso, `YA_EXISTE`) y después le avisa a la IA con
   * `vincular`. Si la postulación se creó pero el vínculo falló, devuelve el error con su id.
   */
  async seguir(a: AvisoIa): Promise<ResultadoSeguir> {
    this.marcar(a.id, true);
    let postulacionId: string | undefined;
    let yaExistia = false;
    try {
      try {
        const d = await firstValueFrom(this.api.crear(aPostulacion(a)));
        this.tablero.actualizar(d);
        postulacionId = d.id;
      } catch (e) {
        const err = aError(e);
        if (err.codigo !== 'YA_EXISTE' || !err.existenteId) throw err;
        postulacionId = err.existenteId;
        yaExistia = true;
      }
      const v = await firstValueFrom(this.ia.vincular(a.id, postulacionId));
      this.reemplazar(v);
      return { ok: true, postulacionId, yaExistia };
    } catch (e) {
      return { ok: false, error: aError(e), ...(postulacionId ? { postulacionId } : {}) };
    } finally {
      this.marcar(a.id, false);
    }
  }

  /** Pone al día un aviso de la lista con lo que respondió la API. */
  reemplazar(a: AvisoIa | AvisoIaDetalle): void {
    this.items.update((xs) => xs.map((x) => (x.id === a.id ? { ...x, ...a } : x)));
  }

  private marcar(id: string, si: boolean): void {
    this.siguiendo.update((s) => {
      const n = new Set(s);
      if (si) n.add(id);
      else n.delete(id);
      return n;
    });
  }
}
