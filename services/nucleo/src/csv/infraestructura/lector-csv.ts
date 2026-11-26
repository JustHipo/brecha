import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { DatoInvalido } from '../../postulaciones/dominio/errores';
import type { LectorCsv, TablaCsv } from '../aplicacion/formato';

/** Adaptador con csv-parse y csv-stringify (csv.md P6): RFC 4180, BOM de Excel, saltos de línea dentro de celdas. */
export class LectorCsvParse implements LectorCsv {
  leer(texto: string): TablaCsv {
    if (!texto.trim()) throw new DatoInvalido('csv', 'El archivo está vacío');
    let registros: { record: string[]; info: { lines: number } }[];
    try {
      registros = parse(texto, {
        bom: true,
        info: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: false,
      }) as unknown as { record: string[]; info: { lines: number } }[];
    } catch (e) {
      const linea = (e as { lines?: number }).lines;
      throw new DatoInvalido(
        'csv',
        `No se pudo leer el CSV${linea ? ` (línea ${linea})` : ''}: revisa que las comillas estén cerradas`,
      );
    }
    const [cabecera, ...resto] = registros;
    if (!cabecera) throw new DatoInvalido('csv', 'El archivo está vacío');
    const columnas = cabecera.record.map((c) => c.trim().toLowerCase());
    if (columnas.length === 1 && columnas[0]!.includes(';')) {
      throw new DatoInvalido(
        'csv',
        'El archivo usa punto y coma como separador. Guárdalo como «CSV UTF-8 (delimitado por comas)»',
      );
    }
    // `info.lines` es la línea donde termina el registro, y csv-parse cuenta como dos líneas un \r\n dentro
    // de una celda (archivos de Excel): se corrige para informar la línea donde empieza cada fila.
    let sobrante = cuenta(cabecera.record, /\r\n/g);
    const filas = resto
      .map(({ record, info }) => {
        sobrante += cuenta(record, /\r\n/g);
        const saltos = cuenta(record, /\r\n|\r|\n/g);
        const valores: Record<string, string> = {};
        columnas.forEach((c, i) => {
          if (c) valores[c] = record[i] ?? '';
        });
        return {
          linea: info.lines - sobrante - saltos,
          valores,
          vacia: record.every((x) => x.trim() === ''),
        };
      })
      .filter((f) => !f.vacia)
      .map(({ linea, valores }) => ({ linea, valores }));
    return { columnas, filas };
  }

  /** Con BOM, para que Excel lea bien las tildes. */
  escribir(columnas: readonly string[], filas: string[][]): string {
    return stringify([[...columnas], ...filas], { bom: true });
  }
}

const cuenta = (celdas: string[], patron: RegExp) =>
  celdas.reduce((n, x) => n + (x.match(patron)?.length ?? 0), 0);
