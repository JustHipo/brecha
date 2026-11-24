import { ErrorDeDominio } from '../../compartido/dominio/error-de-dominio';
import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import type { Fecha, Reloj } from '../../compartido/dominio/puertos';
import { esTerminal, type EstadoPostulacion } from '../dominio/estado';
import { crearAvisoResumen, crearCanal } from '../dominio/objetos-valor/valores';
import { Postulacion } from '../dominio/postulacion';
import { deps, type Contexto } from './base';

/** Una ficha ya normalizada, venga de donde venga (cada adaptador traduce su formato: artifact, CSV). */
export interface FichaImportable {
  aviso: {
    titulo: string;
    empresa: string;
    url: string;
    plataforma: string;
    modalidad?: string;
    ubicacion?: string;
    cierre?: string;
    stack?: string[];
    requisitos?: string;
    sueldoPublicado?: string;
  };
  estado: EstadoPostulacion;
  fechaPostulacion?: Fecha;
  canal?: { tipo: string; valor: string };
  motivo?: string;
  /** Una sola nota (artifact) o varias (CSV). */
  nota?: string;
  notas?: string[];
  etiquetas?: string[];
  prioridad?: Prioridad;
  /** Dirección a la que hay que mandar la postulación: va como contacto, no como canal (csv.md §2). */
  correoPostulacion?: string;
}

export interface ResultadoImportacion {
  creadas: number;
  omitidas: number;
  errores: { url: string; codigo: string; mensaje: string; campo?: string }[];
}

export type ResultadoFicha = { resultado: 'creada' | 'ya_estaba'; id: string; advertencia?: string };

export const ROL_CORREO_POSTULACION = 'Postulación por correo';

/** Un reloj que avanza 1 ms en cada lectura: las notas de una misma ficha quedan en orden, sin empates. */
function relojQueAvanza(base: Reloj): Reloj {
  let n = 0;
  return {
    ahora: () => new Date(base.ahora().getTime() + n++),
    hoy: () => base.hoy(),
    fechaDe: (i) => base.fechaDe(i),
  };
}

/**
 * F1-11 y csv.md: crea las postulaciones con su estado (origen `importacion`, sin pasar por los estados
 * intermedios ni abrir discrepancias). Idempotente por `aviso.url`: si ya hay una postulación de ese aviso,
 * en cualquier estado, no se toca.
 */
export class ImportarFichas {
  constructor(private readonly c: Contexto) {}

  async importarUna(f: FichaImportable): Promise<ResultadoFicha> {
    const aviso = crearAvisoResumen(f.aviso);
    const existente = await this.c.repo.idPorUrl(aviso.url);
    if (existente) return { resultado: 'ya_estaba', id: existente };
    const d = { ...deps(this.c), reloj: relojQueAvanza(this.c.reloj) };
    const p = Postulacion.crear(
      {
        aviso,
        estado: f.estado,
        ...(f.fechaPostulacion ? { fechaPostulacion: f.fechaPostulacion } : {}),
        ...(f.canal ? { canal: crearCanal(f.canal) } : {}),
        ...(f.motivo ? { motivo: f.motivo } : {}),
        ...(f.etiquetas ? { etiquetas: f.etiquetas } : {}),
        ...(f.prioridad ? { prioridadFijada: f.prioridad } : {}),
        origen: 'importacion',
      },
      d,
    );
    let advertencia: string | undefined;
    if (f.correoPostulacion) {
      if (esTerminal(f.estado)) {
        // R8: una postulación cerrada no recibe contactos; el correo no se pierde, queda como nota.
        p.agregarNota(`${ROL_CORREO_POSTULACION}: ${f.correoPostulacion}`, d);
        advertencia = 'La postulación está cerrada: el correo de postulación quedó como nota';
      } else {
        p.agregarContacto(
          { nombre: ROL_CORREO_POSTULACION, rol: ROL_CORREO_POSTULACION, email: f.correoPostulacion },
          d,
        );
      }
    }
    for (const texto of [...(f.nota ? [f.nota] : []), ...(f.notas ?? [])]) {
      if (texto.trim()) p.agregarNota(texto.trim().slice(0, 5000), d);
    }
    await this.c.repo.guardar(p);
    return { resultado: 'creada', id: p.id, ...(advertencia ? { advertencia } : {}) };
  }

  async ejecutar(fichas: FichaImportable[]): Promise<ResultadoImportacion> {
    const r: ResultadoImportacion = { creadas: 0, omitidas: 0, errores: [] };
    for (const f of fichas) {
      try {
        const x = await this.importarUna(f);
        if (x.resultado === 'creada') r.creadas += 1;
        else r.omitidas += 1;
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
