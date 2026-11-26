import { ErrorDeDominio } from '../../compartido/dominio/error-de-dominio';
import type { Reloj } from '../../compartido/dominio/puertos';
import { DatoInvalido } from '../../postulaciones/dominio/errores';
import type { ConsultasDePostulaciones } from '../../postulaciones/aplicacion/puertos';
import { ROL_CORREO_POSTULACION, type ImportarFichas } from '../../postulaciones/aplicacion/importar-fichas';
import type { VistaDetalle } from '../../postulaciones/aplicacion/vistas';
import type { RegistrarContacto } from '../../red/aplicacion/casos-de-red';
import { perfilNormalizado, type RedRepositorio } from '../../red/dominio/contacto-de-red';
import {
  camposDeNotas,
  columnaDe,
  COLUMNAS,
  COLUMNAS_CONTACTOS,
  COLUMNAS_POSTULACIONES,
  detectarTipo,
  EJEMPLOS,
  filaAFicha,
  notasDeContacto,
  revisarEncabezado,
  SEPARADOR_NOTAS,
  TIPOS_CSV,
  type LectorCsv,
  type TipoCsv,
} from './formato';

export interface ContextoCsv {
  lector: LectorCsv;
  reloj: Reloj;
  fichas: ImportarFichas;
  registrarContacto: RegistrarContacto;
  red: RedRepositorio;
  consultas: ConsultasDePostulaciones;
  idPorUrl(url: string): Promise<string | null>;
}

export interface FilaImportada {
  /** Línea del archivo (el encabezado es la 1). */
  fila: number;
  resultado: 'creada' | 'ya_estaba' | 'actualizada' | 'error';
  /** URL del aviso o nombre del contacto, para reconocer la fila. */
  clave: string;
  id?: string;
  advertencias: string[];
  codigo?: string;
  campo?: string;
  mensaje?: string;
}

export interface ResultadoCsv {
  tipo: TipoCsv;
  creadas: number;
  yaEstaban: number;
  actualizadas: number;
  errores: number;
  conAdvertencias: number;
  /** Advertencias del archivo entero (columnas que no se usan). */
  advertencias: string[];
  filas: FilaImportada[];
}

export const MAX_FILAS = 5000;

/**
 * Importa un CSV de postulaciones o de contactos (docs/diseno/csv.md). Cada fila va por su cuenta: una fila mala
 * se informa con su línea, su columna y el motivo, y no corta las demás. Importar dos veces deja lo mismo.
 */
export class ImportarCsv {
  constructor(private readonly c: ContextoCsv) {}

  async ejecutar(e: { csv: string; tipo?: TipoCsv }): Promise<ResultadoCsv> {
    if (e.tipo !== undefined && !TIPOS_CSV.includes(e.tipo))
      throw new DatoInvalido('tipo', `Tipo desconocido: usa ${TIPOS_CSV.join(' o ')}`);
    const tabla = this.c.lector.leer(e.csv);
    const tipo = e.tipo ?? detectarTipo(tabla.columnas);
    if (!tipo) {
      throw new DatoInvalido(
        'csv',
        `No reconozco el encabezado. Postulaciones: ${COLUMNAS_POSTULACIONES.join(',')}. Contactos: ${COLUMNAS_CONTACTOS.join(',')}`,
      );
    }
    const advertencias = revisarEncabezado(tipo, tabla.columnas);
    if (tabla.filas.length > MAX_FILAS)
      throw new DatoInvalido(
        'csv',
        `El archivo tiene ${tabla.filas.length} filas; el máximo es ${MAX_FILAS}`,
      );

    const r: ResultadoCsv = {
      tipo,
      creadas: 0,
      yaEstaban: 0,
      actualizadas: 0,
      errores: 0,
      conAdvertencias: 0,
      advertencias,
      filas: [],
    };
    for (const { linea, valores } of tabla.filas) {
      const clave =
        tipo === 'postulaciones' ? (valores['url'] ?? '').trim() : (valores['nombre'] ?? '').trim();
      let fila: FilaImportada;
      try {
        fila =
          tipo === 'postulaciones'
            ? await this.postulacion(linea, clave, valores)
            : await this.contacto(linea, clave, valores);
      } catch (err) {
        if (!(err instanceof ErrorDeDominio)) throw err;
        const campo = columnaDe(err.campo);
        fila = {
          fila: linea,
          resultado: 'error',
          clave,
          advertencias: [],
          codigo: err.codigo,
          ...(campo ? { campo } : {}),
          mensaje: err.message,
        };
      }
      r.filas.push(fila);
      if (fila.resultado === 'creada') r.creadas += 1;
      else if (fila.resultado === 'ya_estaba') r.yaEstaban += 1;
      else if (fila.resultado === 'actualizada') r.actualizadas += 1;
      else r.errores += 1;
      if (fila.advertencias.length) r.conAdvertencias += 1;
    }
    return r;
  }

  private async postulacion(linea: number, clave: string, v: Record<string, string>): Promise<FilaImportada> {
    const { ficha, advertencias } = filaAFicha(v, this.c.reloj.hoy());
    const x = await this.c.fichas.importarUna(ficha);
    if (x.advertencia) advertencias.push(x.advertencia);
    return { fila: linea, resultado: x.resultado, clave, id: x.id, advertencias };
  }

  private async contacto(linea: number, clave: string, v: Record<string, string>): Promise<FilaImportada> {
    const advertencias: string[] = [];
    const t = (c: string) => (v[c] ?? '').trim();
    let perfilUrl = t('perfil_url');
    let pagina = '';
    if (!perfilUrl) {
      advertencias.push(
        'Sin perfil de LinkedIn: se reconoce por nombre y empresa; complétalo cuando lo tengas',
      );
    } else {
      try {
        perfilNormalizado(perfilUrl);
      } catch {
        advertencias.push(
          'La URL no es un perfil de LinkedIn: quedó en las notas y el contacto se importó sin perfil',
        );
        pagina = perfilUrl;
        perfilUrl = '';
      }
    }
    let postulacionId: string | undefined;
    const url = t('url_postulacion');
    if (url) {
      postulacionId = (await this.c.idPorUrl(url)) ?? undefined;
      if (!postulacionId)
        advertencias.push('No hay una postulación con esa URL: el contacto se importó sin ligar');
    }
    const motivo = [t('motivo'), pagina ? `Página: ${pagina}` : ''].filter(Boolean).join('\n');
    const notas = notasDeContacto({ correo: t('correo'), motivo, mensaje_sugerido: t('mensaje_sugerido') });
    const r = await this.c.registrarContacto.ejecutar({
      nombre: t('nombre'),
      ...(perfilUrl ? { perfilUrl } : {}),
      ...(t('titular') ? { titular: t('titular') } : {}),
      ...(t('empresa') ? { empresa: t('empresa') } : {}),
      ...(postulacionId ? { postulacionId } : {}),
      ...(notas ? { notas } : {}),
    });
    const resultado = r.nuevo ? 'creada' : r.cambiado ? 'actualizada' : 'ya_estaba';
    return { fila: linea, resultado, clave, id: r.id, advertencias };
  }
}

/** Exporta en el mismo formato de la importación, ordenado para que dos exportaciones iguales den el mismo archivo. */
export class ExportarCsv {
  constructor(private readonly c: ContextoCsv) {}

  async ejecutar(tipo: TipoCsv): Promise<string> {
    if (!TIPOS_CSV.includes(tipo))
      throw new DatoInvalido('tipo', `Tipo desconocido: usa ${TIPOS_CSV.join(' o ')}`);
    const { postulaciones } = await this.c.consultas.exportar();
    if (tipo === 'postulaciones') {
      const filas = [...postulaciones].sort((a, b) => a.url.localeCompare(b.url)).map(filaDePostulacion);
      return this.c.lector.escribir(COLUMNAS_POSTULACIONES, filas);
    }
    const urlDe = new Map(postulaciones.map((p) => [p.id, p.url]));
    const filas: string[][] = [];
    const contactos = (await this.c.red.todos())
      .map((x) => x.datos())
      .sort(
        (a, b) =>
          (a.perfilUrl ?? '').localeCompare(b.perfilUrl ?? '') ||
          a.nombre.localeCompare(b.nombre) ||
          (a.empresa ?? '').localeCompare(b.empresa ?? ''),
      );
    for (const d of contactos) {
      const n = camposDeNotas(d.notas);
      const urls = d.postulacionIds
        .map((id) => urlDe.get(id))
        .filter((u): u is string => !!u)
        .sort();
      for (const url of urls.length ? urls : ['']) {
        filas.push([
          d.nombre,
          d.perfilUrl ?? '',
          d.titular ?? '',
          d.empresa ?? '',
          n.correo,
          url,
          n.motivo,
          n.mensaje_sugerido,
        ]);
      }
    }
    return this.c.lector.escribir(COLUMNAS_CONTACTOS, filas);
  }
}

function filaDePostulacion(p: VistaDetalle): string[] {
  const cerrada = p.estado === 'rechazado' || p.estado === 'descartado';
  // El historial viene del más nuevo al más antiguo: el motivo es el del cambio que la dejó en su estado.
  const motivo = cerrada ? (p.historial.find((c) => c.a === p.estado)?.motivo ?? '') : '';
  const correo = p.contactos.find((c) => c.rol === ROL_CORREO_POSTULACION)?.email ?? '';
  const notas = [...p.notas]
    .reverse()
    .map((n) => n.texto)
    .join(SEPARADOR_NOTAS);
  return [
    p.titulo,
    p.empresa,
    p.url,
    p.plataforma,
    p.modalidad,
    p.ubicacion,
    p.cierre ?? '',
    p.estado,
    p.prioridadFijada ?? '',
    p.fechaPostulacion ?? '',
    p.canal?.tipo ?? '',
    p.canal?.valor ?? '',
    correo,
    p.aviso.sueldoPublicado ?? '',
    (p.aviso.stack ?? []).join(';'),
    p.aviso.requisitos ?? '',
    p.etiquetas.join(';'),
    notas,
    motivo,
  ];
}

export class PlantillaCsv {
  constructor(private readonly c: Pick<ContextoCsv, 'lector'>) {}
  ejecutar(tipo: TipoCsv): string {
    if (!TIPOS_CSV.includes(tipo))
      throw new DatoInvalido('tipo', `Tipo desconocido: usa ${TIPOS_CSV.join(' o ')}`);
    return this.c.lector.escribir(COLUMNAS[tipo], EJEMPLOS[tipo]);
  }
}

export class CasosCsv {
  readonly importar: ImportarCsv;
  readonly exportar: ExportarCsv;
  readonly plantilla: PlantillaCsv;
  constructor(c: ContextoCsv) {
    this.importar = new ImportarCsv(c);
    this.exportar = new ExportarCsv(c);
    this.plantilla = new PlantillaCsv(c);
  }
}
