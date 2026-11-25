import { describe, expect, it } from 'vitest';
import {
  anotarCambio,
  aplicarCambios,
  describirRegla,
  etiquetasEnUso,
  reglaGuardada,
  ReglaInvalida,
  ReglaNoEncontrada,
  type Catalogo,
  type Regla,
} from './perfil';
import { depsDePrueba } from './pruebas.prueba';

type C = 'monto' | 'lista';
const cat: Catalogo<C> = {
  criterios: ['monto', 'lista'],
  valor: (c, v) => {
    if (c === 'monto') {
      if (typeof v !== 'number') throw new ReglaInvalida('valor', 'Pon un monto');
      return v;
    }
    return Array.isArray(v) ? v : [v];
  },
  describir: (c, v) => (c === 'monto' ? `Hasta ${String(v)}` : `Una de: ${(v as string[]).join(', ')}`),
};

const lineas = (rs: Regla<C>[]) => rs.map(describirRegla);

function base(): Regla<C>[] {
  return aplicarCambios(
    [],
    {
      agregar: [
        { texto: 'Santiago solo híbrido', etiquetas: ['Ubicación', 'santiago'] },
        { texto: 'A', dura: false },
        { texto: 'B', dura: false },
        { texto: 'C', dura: false },
      ],
    },
    cat,
    depsDePrueba(),
  );
}

describe('perfil de búsqueda (regla común)', () => {
  it('agrega reglas con texto libre y etiquetas normalizadas; las blandas sin prioridad van al final', () => {
    expect(lineas(base())).toEqual([
      'Dura · Santiago solo híbrido #ubicacion #santiago',
      'P1 · A',
      'P2 · B',
      'P3 · C',
    ]);
  });

  it('una blanda nueva con prioridad N queda en N y corre las demás', () => {
    const rs = aplicarCambios(
      base(),
      { agregar: [{ texto: 'Nueva', dura: false, prioridad: 2 }] },
      cat,
      depsDePrueba(),
    );
    expect(lineas(rs).slice(1)).toEqual(['P1 · A', 'P2 · Nueva', 'P3 · B', 'P4 · C']);
  });

  it('cambiar la prioridad mueve la regla hacia arriba o hacia abajo', () => {
    const rs = base();
    const c = rs.find((r) => r.texto === 'C')!;
    const a = rs.find((r) => r.texto === 'A')!;
    const arriba = aplicarCambios(rs, { cambiar: [{ id: c.id, prioridad: 1 }] }, cat, depsDePrueba());
    expect(lineas(arriba).slice(1)).toEqual(['P1 · C', 'P2 · A', 'P3 · B']);
    const abajo = aplicarCambios(rs, { cambiar: [{ id: a.id, prioridad: 3 }] }, cat, depsDePrueba());
    expect(lineas(abajo).slice(1)).toEqual(['P1 · B', 'P2 · C', 'P3 · A']);
  });

  it('ordenar pone las blandas en el orden pedido y rechaza una dura', () => {
    const rs = base();
    const id = (t: string) => rs.find((r) => r.texto === t)!.id;
    const nuevas = aplicarCambios(rs, { ordenar: [id('B'), id('C')] }, cat, depsDePrueba());
    expect(lineas(nuevas).slice(1)).toEqual(['P1 · B', 'P2 · C', 'P3 · A']);
    expect(() => aplicarCambios(rs, { ordenar: [rs[0]!.id] }, cat, depsDePrueba())).toThrow(/dura/);
  });

  it('cambiar solo toca lo que se manda; quitar borra; un id que no existe es NO_ENCONTRADO', () => {
    const rs = base();
    const dura = rs[0]!;
    const cambiadas = aplicarCambios(
      rs,
      { cambiar: [{ id: dura.id, etiquetas: ['region'] }], quitar: [rs[1]!.id] },
      cat,
      depsDePrueba(),
    );
    expect(lineas(cambiadas)).toEqual(['Dura · Santiago solo híbrido #region', 'P1 · B', 'P2 · C']);
    expect(cambiadas[0]!.id).toBe(dura.id);
    expect(() => aplicarCambios(rs, { quitar: ['no-existe'] }, cat, depsDePrueba())).toThrow(
      ReglaNoEncontrada,
    );
  });

  it('pasar una dura a blanda sin prioridad la deja al final; de blanda a dura pierde la prioridad', () => {
    const rs = base();
    const aBlanda = aplicarCambios(rs, { cambiar: [{ id: rs[0]!.id, dura: false }] }, cat, depsDePrueba());
    expect(lineas(aBlanda)).toEqual([
      'P1 · A',
      'P2 · B',
      'P3 · C',
      'P4 · Santiago solo híbrido #ubicacion #santiago',
    ]);
    const aDura = aplicarCambios(rs, { cambiar: [{ id: rs[1]!.id, dura: true }] }, cat, depsDePrueba());
    expect(aDura.filter((r) => r.dura).map((r) => [r.texto, r.prioridad])).toEqual([
      ['Santiago solo híbrido', undefined],
      ['A', undefined],
    ]);
  });

  it('con criterio y sin texto se describe sola, y si cambia el valor se vuelve a describir', () => {
    const [r] = aplicarCambios([], { agregar: [{ criterio: 'monto', valor: 100 }] }, cat, depsDePrueba());
    expect(r!.texto).toBe('Hasta 100');
    const [r2] = aplicarCambios([r!], { cambiar: [{ id: r!.id, valor: 200 }] }, cat, depsDePrueba());
    expect(r2!.texto).toBe('Hasta 200');
    // Un texto escrito por la persona no se pisa.
    const [r3] = aplicarCambios(
      [{ ...r2!, texto: 'Mi tope' }],
      { cambiar: [{ id: r!.id, valor: 300 }] },
      cat,
      depsDePrueba(),
    );
    expect(r3!.texto).toBe('Mi tope');
    expect(r3!.valor).toBe(300);
  });

  it('rechaza un criterio desconocido, una regla sin texto ni criterio y demasiadas etiquetas', () => {
    const agregar = (e: unknown) => () => aplicarCambios([], { agregar: [e] }, cat, depsDePrueba());
    expect(agregar({ criterio: 'castillo' })).toThrow(/Criterio desconocido/);
    expect(agregar({ texto: '  ' })).toThrow(/Escribe la regla/);
    expect(agregar({ texto: 'x', etiquetas: Array.from({ length: 11 }, (_, i) => `e${i}`) })).toThrow(
      /10 etiquetas/,
    );
    expect(agregar({ criterio: 'monto', valor: 'mucho' })).toThrow(/monto/);
  });

  it('reemplazar la lista conserva los id que vienen y da id nuevos al resto', () => {
    const rs = base();
    const nuevas = aplicarCambios(
      rs,
      {
        reglas: [
          { id: rs[0]!.id, texto: 'Santiago' },
          { id: 'inventado', texto: 'Otra' },
        ],
      },
      cat,
      depsDePrueba(),
    );
    expect(nuevas[0]!.id).toBe(rs[0]!.id);
    expect(nuevas[1]!.id).not.toBe('inventado');
  });

  it('una regla guardada antes del perfil recibe su descripción y etiquetas vacías', () => {
    const vieja = reglaGuardada(
      { id: 'r1', criterio: 'monto', valor: 50, dura: false, prioridad: 2 } as never,
      cat,
    );
    expect(vieja).toEqual({
      id: 'r1',
      texto: 'Hasta 50',
      criterio: 'monto',
      valor: 50,
      dura: false,
      prioridad: 2,
      etiquetas: [],
    });
  });

  it('el historial pide motivo y guarda cómo quedaron las reglas', () => {
    const ahora = new Date('2026-11-24T20:00:00Z');
    expect(() => anotarCambio([], base(), { motivo: ' ', origen: 'ia' }, ahora)).toThrow(/motivo/);
    const h = anotarCambio([], base(), { motivo: 'Juan lo pidió', origen: 'ia' }, ahora);
    expect(h).toEqual([
      { ocurridoEn: ahora, origen: 'ia', motivo: 'Juan lo pidió', resumen: lineas(base()) },
    ]);
  });

  it('cuenta las etiquetas en uso', () => {
    const rs = aplicarCambios(
      base(),
      { agregar: [{ texto: 'x', etiquetas: ['santiago'] }] },
      cat,
      depsDePrueba(),
    );
    expect(etiquetasEnUso(rs)).toEqual([
      { etiqueta: 'santiago', total: 2 },
      { etiqueta: 'ubicacion', total: 1 },
    ]);
  });
});
