import { describe, expect, it } from 'vitest';
import { herramientasDeTarjeta, herramientasPedidas } from './piezas';

describe('herramientas del aviso (csv.md §7)', () => {
  const analisis = {
    requisitos: [
      { nombre: 'Python', obligatorio: true },
      { nombre: 'LabVIEW', obligatorio: true },
      { nombre: 'MATLAB', obligatorio: true },
      { nombre: 'AWS', obligatorio: false },
    ],
    cumple: ['Python'],
    brechas: ['LabVIEW', 'AWS', 'MATLAB (1 de 3 años)'],
  };

  it('marca lo que falta, lo que tienes y lo que tienes con menos años', () => {
    expect(herramientasPedidas(analisis, [], true)).toEqual([
      { nombre: 'Python', obligatorio: true, estado: 'si' },
      { nombre: 'LabVIEW', obligatorio: true, estado: 'falta' },
      { nombre: 'MATLAB', obligatorio: true, estado: 'menos', detalle: '1 de 3 años' },
      { nombre: 'AWS', obligatorio: false, estado: 'falta' },
    ]);
  });

  it('sin calce o sin análisis muestra el stack sin colores', () => {
    expect(herramientasPedidas(null, ['Python', 'Excel'], false).map((h) => h.estado)).toEqual([
      'sin_dato',
      'sin_dato',
    ]);
    expect(herramientasPedidas(analisis, [], false).every((h) => h.estado === 'sin_dato')).toBe(
      true,
    );
  });

  it('la tarjeta de Avisos cruza el stack con las brechas y suma las que no estaban', () => {
    const r = herramientasDeTarjeta({
      stack: ['Python', 'labview'],
      brechas: ['LabVIEW', 'Inglés (1 de 2 años)'],
      calce: 50,
    });
    expect(r.map((h) => [h.nombre, h.estado])).toEqual([
      ['Python', 'si'],
      ['labview', 'falta'],
      ['Inglés', 'menos'],
    ]);
    expect(herramientasDeTarjeta({ stack: ['Python'], brechas: [], calce: null })[0]!.estado).toBe(
      'sin_dato',
    );
  });
});
