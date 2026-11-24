import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatoInvalido } from '../../postulaciones/dominio/errores';
import { LectorCsvParse } from '../infraestructura/lector-csv';
import {
  camposDeNotas,
  COLUMNAS_CONTACTOS,
  COLUMNAS_POSTULACIONES,
  detectarTipo,
  filaAFicha,
  notasDeContacto,
  revisarEncabezado,
  separarNotas,
} from './formato';

const HOY = '2026-11-24';
const lector = new LectorCsvParse();
const fila = (v: Record<string, string>) => ({
  titulo: 'Práctica',
  empresa: 'Ficticia',
  url: 'https://ejemplo.test/1',
  ...v,
});
const errorEn = (v: Record<string, string>) => {
  try {
    filaAFicha(fila(v), HOY);
  } catch (e) {
    if (e instanceof DatoInvalido) return e.campo;
    throw e;
  }
  return 'sin error';
};

describe('lector CSV', () => {
  it('quita el BOM, baja el encabezado a minúsculas y lee celdas con comas, comillas y saltos de línea', () => {
    const t = lector.leer(
      '﻿Titulo,URL,Notas\r\n"A, con coma",https://x.test,"línea 1\r\nlínea ""2"""\r\n\r\nB,https://y.test,\r\n',
    );
    expect(t.columnas).toEqual(['titulo', 'url', 'notas']);
    expect(t.filas).toEqual([
      { linea: 2, valores: { titulo: 'A, con coma', url: 'https://x.test', notas: 'línea 1\r\nlínea "2"' } },
      { linea: 5, valores: { titulo: 'B', url: 'https://y.test', notas: '' } },
    ]);
  });

  it('un archivo con punto y coma o con comillas abiertas da un error claro', () => {
    expect(() => lector.leer('titulo;url\nA;B')).toThrow(/punto y coma/);
    expect(() => lector.leer('titulo,url\n"A,B')).toThrow(/comillas/);
    expect(() => lector.leer('  \n')).toThrow(/vacío/);
  });

  it('escribir con BOM y volver a leer da lo mismo', () => {
    const texto = lector.escribir(['a', 'b'], [['x, y', 'con "comillas"\ny salto']]);
    expect(texto.startsWith('﻿')).toBe(true);
    expect(lector.leer(texto).filas[0]!.valores).toEqual({ a: 'x, y', b: 'con "comillas"\ny salto' });
  });
});

describe('encabezado', () => {
  it('reconoce el tipo y exige las columnas obligatorias', () => {
    expect(detectarTipo(COLUMNAS_POSTULACIONES)).toBe('postulaciones');
    expect(detectarTipo(COLUMNAS_CONTACTOS)).toBe('contactos');
    expect(detectarTipo(['a', 'b'])).toBeNull();
    expect(() => revisarEncabezado('postulaciones', ['titulo', 'url'])).toThrow(/empresa/);
    expect(revisarEncabezado('postulaciones', ['titulo', 'empresa', 'url', 'color'])).toEqual([
      'Columnas que no se usan: color',
    ]);
  });

  it('los CSV de ejemplo del repo tienen el encabezado exacto', () => {
    const raiz = resolve(__dirname, '../../../../../datos/ejemplo/csv');
    expect(lector.leer(readFileSync(`${raiz}/postulaciones.csv`, 'utf8')).columnas).toEqual([
      ...COLUMNAS_POSTULACIONES,
    ]);
    expect(lector.leer(readFileSync(`${raiz}/contactos.csv`, 'utf8')).columnas).toEqual([
      ...COLUMNAS_CONTACTOS,
    ]);
  });
});

describe('fila de postulaciones', () => {
  it('una fila mínima queda en sin_decidir con la plataforma deducida de la URL', () => {
    const { ficha } = filaAFicha(fila({ url: 'https://cl.linkedin.com/jobs/view/1' }), HOY);
    expect(ficha).toMatchObject({
      estado: 'sin_decidir',
      aviso: { plataforma: 'linkedin', modalidad: 'no_indica' },
    });
    expect(ficha).not.toHaveProperty('motivo');
  });

  it('listas con punto y coma, notas separadas por ---, prioridad y correo de postulación', () => {
    const { ficha } = filaAFicha(
      fila({
        stack: 'Python; MATLAB;;',
        etiquetas: 'investigacion;p1',
        notas: 'uno\n---\ndos',
        prioridad: 'Alta',
        correo_postulacion: 'rrhh@ejemplo.test',
        sueldo_publicado: 'CLP 150.000',
      }),
      HOY,
    );
    expect(ficha).toMatchObject({
      aviso: { stack: ['Python', 'MATLAB'], sueldoPublicado: 'CLP 150.000' },
      etiquetas: ['investigacion', 'p1'],
      notas: ['uno', 'dos'],
      prioridad: 'alta',
      correoPostulacion: 'rrhh@ejemplo.test',
    });
  });

  it('desde postulado en adelante exige fecha y canal (R2); descartado solo si trae alguno (P8)', () => {
    expect(errorEn({ estado: 'postulado' })).toBe('fecha_postulacion');
    expect(errorEn({ estado: 'entrevista', fecha_postulacion: '2026-11-01' })).toBe('canal_tipo');
    expect(errorEn({ estado: 'rechazado', fecha_postulacion: '2026-11-01', canal_tipo: 'portal' })).toBe(
      'canal_valor',
    );
    expect(errorEn({ estado: 'descartado' })).toBe('sin error');
    expect(errorEn({ estado: 'descartado', canal_tipo: 'portal' })).toBe('fecha_postulacion');
    expect(
      errorEn({
        estado: 'postulado',
        fecha_postulacion: '2026-11-25',
        canal_tipo: 'portal',
        canal_valor: 'x',
      }),
    ).toBe('fecha_postulacion');
  });

  it('rechazado y descartado llevan el motivo de la columna o «Importado desde CSV» (P3)', () => {
    expect(filaAFicha(fila({ estado: 'descartado' }), HOY).ficha.motivo).toBe('Importado desde CSV');
    expect(filaAFicha(fila({ estado: 'descartado', motivo: 'Lejos' }), HOY).ficha.motivo).toBe('Lejos');
    expect(filaAFicha(fila({ motivo: 'Lejos' }), HOY).advertencias).toHaveLength(1);
  });

  it('cada valor malo dice su columna', () => {
    expect(errorEn({ plataforma: 'myspace' })).toBe('plataforma');
    expect(errorEn({ modalidad: 'a veces' })).toBe('modalidad');
    expect(errorEn({ cierre: '15-12-2026' })).toBe('cierre');
    expect(errorEn({ estado: 'pendiente' })).toBe('estado');
    expect(errorEn({ prioridad: 'urgente' })).toBe('prioridad');
    expect(errorEn({ correo_postulacion: 'no-es-correo' })).toBe('correo_postulacion');
    expect(errorEn({ url: '' })).toBe('url');
  });
});

describe('notas de contactos', () => {
  it('se escriben con etiquetas y vuelven a sus columnas', () => {
    const notas = notasDeContacto({
      correo: 'a@b.test',
      motivo: 'Lidera',
      mensaje_sugerido: 'Hola,\nte escribo',
    });
    expect(notas).toBe('Correo: a@b.test\nMotivo: Lidera\nMensaje sugerido: Hola,\nte escribo');
    expect(camposDeNotas(notas)).toEqual({
      correo: 'a@b.test',
      motivo: 'Lidera',
      mensaje_sugerido: 'Hola,\nte escribo',
    });
  });

  it('el texto sin etiqueta va a motivo', () => {
    expect(camposDeNotas('Nota escrita a mano')).toEqual({
      correo: '',
      motivo: 'Nota escrita a mano',
      mensaje_sugerido: '',
    });
    expect(camposDeNotas(null).motivo).toBe('');
  });

  it('las notas de postulación se separan con ---', () => {
    expect(separarNotas('a\r\n---\r\nb\n-----\nc')).toEqual(['a', 'b', 'c']);
  });
});
