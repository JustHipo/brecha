import { describe, expect, it } from 'vitest';
import {
  aEditables,
  aEntradas,
  agrupar,
  claveNueva,
  etiquetasEnUso,
  fijarDura,
  moverBlanda,
  normalizarEtiqueta,
  valorVacio,
  type ReglaLeida,
} from './reglas';

const leidas: ReglaLeida[] = [
  { id: 'b2', texto: 'B', dura: false, prioridad: 2, etiquetas: [] },
  {
    id: 'm',
    texto: 'Santiago solo híbrido',
    criterio: 'modalidad_por_region',
    valor: {
      valparaiso: ['presencial'],
      santiago: ['hibrido', 'remoto'],
      otra: ['remoto'],
      noIndicaEsPresencialEn: ['trabajando'],
    },
    dura: true,
    etiquetas: ['ubicacion', 'santiago'],
  },
  { id: 'b1', texto: 'A', dura: false, prioridad: 1, etiquetas: ['sueldo'] },
];

describe('página Perfil (perfil.md §5)', () => {
  it('ida y vuelta: conserva id, valor y prioridad por el orden de las blandas', () => {
    const e = aEditables(leidas);
    expect(e.map((r) => r.texto)).toEqual(['Santiago solo híbrido', 'A', 'B']);
    expect(aEntradas('empleo', e)).toEqual([
      {
        id: 'm',
        texto: 'Santiago solo híbrido',
        criterio: 'modalidad_por_region',
        valor: {
          valparaiso: ['presencial'],
          santiago: ['hibrido', 'remoto'],
          otra: ['remoto'],
          noIndicaEsPresencialEn: ['trabajando'],
        },
        dura: true,
        etiquetas: ['ubicacion', 'santiago'],
      },
      { id: 'b1', texto: 'A', dura: false, prioridad: 1, etiquetas: ['sueldo'] },
      { id: 'b2', texto: 'B', dura: false, prioridad: 2, etiquetas: [] },
    ]);
  });

  it('las flechas mueven una blanda entre las blandas y cambian su prioridad', () => {
    const e = aEditables(leidas);
    const bajada = moverBlanda(e, 'b1', 1);
    expect(aEntradas('empleo', bajada).map((r) => [r.texto, r.prioridad ?? null])).toEqual([
      ['Santiago solo híbrido', null],
      ['B', 1],
      ['A', 2],
    ]);
    // Más allá del borde no pasa nada.
    expect(moverBlanda(e, 'b1', -1).map((r) => r.clave)).toEqual(e.map((r) => r.clave));
  });

  it('pasar a blanda la deja última; a dura, después de las duras', () => {
    const e = aEditables(leidas);
    expect(fijarDura(e, 'm', false).map((r) => r.clave)).toEqual(['b1', 'b2', 'm']);
    expect(fijarDura(e, 'b2', true).map((r) => r.clave)).toEqual(['m', 'b2', 'b1']);
  });

  it('agrupa por la primera etiqueta y deja al final las sin etiqueta; el filtro deja solo esas', () => {
    const e = aEditables(leidas);
    expect(agrupar(e, null).map((g) => [g.etiqueta, g.reglas.map((r) => r.texto)])).toEqual([
      ['sueldo', ['A']],
      ['ubicacion', ['Santiago solo híbrido']],
      [null, ['B']],
    ]);
    expect(agrupar(e, 'santiago')[0]!.reglas.map((r) => r.texto)).toEqual([
      'Santiago solo híbrido',
    ]);
    expect(etiquetasEnUso(e)).toEqual([
      { etiqueta: 'santiago', total: 1 },
      { etiqueta: 'sueldo', total: 1 },
      { etiqueta: 'ubicacion', total: 1 },
    ]);
  });

  it('arma los valores de cada chequeo desde el formulario', () => {
    const base = { clave: claveNueva(), texto: '', dura: true, etiquetas: [] };
    const titulo = {
      ...base,
      criterio: 'titulo',
      valor: { ...valorVacio(), incluir: 'full stack, backend', excluir: 'frontend' },
    };
    const sueldo = {
      ...base,
      criterio: 'sueldo_publicado',
      valor: { ...valorVacio(), minimo: '1.400.000' },
    };
    const comuna = {
      ...base,
      criterio: 'comuna',
      valor: { ...valorVacio(), texto: 'Ñuñoa, Providencia' },
    };
    const mascota = { ...base, criterio: 'mascota', valor: { ...valorVacio(), texto: 'no' } };
    expect(aEntradas('empleo', [titulo, sueldo]).map((r) => r.valor)).toEqual([
      { incluir: ['full stack', 'backend'], excluir: ['frontend'] },
      { minimo: 1400000 },
    ]);
    expect(aEntradas('arriendos', [comuna, mascota]).map((r) => r.valor)).toEqual([
      ['Ñuñoa', 'Providencia'],
      false,
    ]);
  });

  it('normaliza etiquetas como el núcleo', () => {
    expect(normalizarEtiqueta('#Ubicación  Región')).toBe('ubicacion region');
  });
});
