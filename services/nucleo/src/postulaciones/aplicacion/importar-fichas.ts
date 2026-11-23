import { ErrorDeDominio } from '../../compartido/dominio/error-de-dominio';
import type { Fecha } from '../../compartido/dominio/puertos';
import type { EstadoPostulacion } from '../dominio/estado';
import { crearAvisoResumen, crearCanal } from '../dominio/objetos-valor/valores';
import { Postulacion } from '../dominio/postulacion';
import { deps, type Contexto } from './base';

/** Una ficha ya normalizada, venga de donde venga (el adaptador traduce cada formato). */
export interface FichaImportable {
  aviso: {
    titulo: string;
    empresa: string;
    url: string;
    plataforma: string;
    modalidad?: string;
    ubicacion?: string;
    cierre?: string;
  };
  estado: EstadoPostulacion;
  fechaPostulacion?: Fecha;
  canal?: { tipo: string; valor: string };
  motivo?: string;
  nota?: string;
}

export interface ResultadoImportacion {
  creadas: number;
  omitidas: number;
  errores: { url: string; codigo: string; mensaje: string; campo?: string }[];
}

/**
 * F1-11: crea las postulaciones con su estado (origen `importacion`). Idempotente por `aviso.url`:
 * si ya hay una postulación de ese aviso, en cualquier estado, se omite.
 */
export class ImportarFichas {
  constructor(private readonly c: Contexto) {}

  async ejecutar(fichas: FichaImportable[]): Promise<ResultadoImportacion> {
    const r: ResultadoImportacion = { creadas: 0, omitidas: 0, errores: [] };
    for (const f of fichas) {
      try {
        const aviso = crearAvisoResumen(f.aviso);
        if (await this.c.repo.idPorUrl(aviso.url)) {
          r.omitidas += 1;
          continue;
        }
        const p = Postulacion.crear(
          {
            aviso,
            estado: f.estado,
            ...(f.fechaPostulacion ? { fechaPostulacion: f.fechaPostulacion } : {}),
            ...(f.canal ? { canal: crearCanal(f.canal) } : {}),
            ...(f.motivo ? { motivo: f.motivo } : {}),
            origen: 'importacion',
          },
          deps(this.c),
        );
        if (f.nota?.trim()) p.agregarNota(f.nota.trim().slice(0, 5000), deps(this.c));
        await this.c.repo.guardar(p);
        r.creadas += 1;
      } catch (e) {
        if (!(e instanceof ErrorDeDominio)) throw e;
        r.errores.push({
          url: f.aviso?.url ?? '',
          codigo: e.codigo,
          mensaje: e.message,
          ...(e.campo ? { campo: e.campo } : {}),
        });
      }
    }
    return r;
  }
}
