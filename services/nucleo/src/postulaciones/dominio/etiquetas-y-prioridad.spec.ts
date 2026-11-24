import { beforeEach, describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { DatoInvalido } from './errores';
import { AVISO, enEstado } from './fabrica.prueba';
import { crearEtiquetas, normalizarEtiqueta } from './objetos-valor/etiquetas';
import { crearAvisoResumen, crearStack } from './objetos-valor/valores';
import { calcularPrioridad } from './politica-de-prioridad';
import { Postulacion } from './postulacion';

let deps: ReturnType<typeof depsDePrueba>;
beforeEach(() => {
  deps = depsDePrueba(new Date('2026-11-23T12:00:00Z'));
});

describe('Etiquetas (csv.md P1)', () => {
  it('normaliza: minúsculas, sin tildes y espacios simples', () => {
    expect(normalizarEtiqueta('  Investigación   Aplicada ')).toBe('investigacion aplicada');
    expect(normalizarEtiqueta('Ñuble')).toBe('nuble');
  });

  it('quita repetidos y vacías, y conserva el orden de llegada', () => {
    expect(crearEtiquetas(['Investigación', 'remoto', 'investigacion', ' ', 'REMOTO'])).toEqual([
      'investigacion',
      'remoto',
    ]);
  });

  it('sin etiquetas es una lista vacía', () => {
    expect(crearEtiquetas(undefined)).toEqual([]);
    expect(crearEtiquetas(null)).toEqual([]);
  });

  it('rechaza lo que no es lista de textos, las largas y más de 20', () => {
    expect(() => crearEtiquetas('investigacion')).toThrow(DatoInvalido);
    expect(() => crearEtiquetas([3])).toThrow(DatoInvalido);
    expect(() => crearEtiquetas(['x'.repeat(41)])).toThrow(/40 caracteres/);
    expect(() => crearEtiquetas(Array.from({ length: 21 }, (_, i) => `e${i}`))).toThrow(/20 etiquetas/);
    expect(crearEtiquetas(Array.from({ length: 20 }, (_, i) => `e${i}`))).toHaveLength(20);
  });
});

describe('Aviso con stack, requisitos y sueldo publicado', () => {
  it('el stack quita vacías y repetidas sin distinguir mayúsculas', () => {
    expect(crearStack(['Python', ' python ', '', 'MATLAB', 'Excel  avanzado'])).toEqual([
      'Python',
      'MATLAB',
      'Excel avanzado',
    ]);
    expect(() => crearStack(Array.from({ length: 41 }, (_, i) => `h${i}`))).toThrow(DatoInvalido);
    expect(() => crearStack(['x'.repeat(61)])).toThrow(DatoInvalido);
  });

  it('el aviso guarda los tres campos solo si traen algo', () => {
    const a = crearAvisoResumen({
      ...AVISO,
      stack: ['Python'],
      requisitos: '  Cursando 5.º año ',
      sueldoPublicado: 'CLP 150.000',
    });
    expect(a).toMatchObject({
      stack: ['Python'],
      requisitos: 'Cursando 5.º año',
      sueldoPublicado: 'CLP 150.000',
    });
    const b = crearAvisoResumen({ ...AVISO, stack: [], requisitos: '' });
    expect(b).not.toHaveProperty('stack');
    expect(b).not.toHaveProperty('requisitos');
    expect(() => crearAvisoResumen({ ...AVISO, sueldoPublicado: 'x'.repeat(201) })).toThrow(DatoInvalido);
  });
});

describe('Prioridad fijada (csv.md P2)', () => {
  it('manda en los estados abiertos y no en los cerrados', () => {
    expect(calcularPrioridad('sin_decidir', undefined, '2026-11-23', 'alta')).toBe('alta');
    expect(calcularPrioridad('postulado', undefined, '2026-11-23', 'baja')).toBe('baja');
    for (const e of ['descartado', 'rechazado', 'aceptada'] as const) {
      expect(calcularPrioridad(e, undefined, '2026-11-23', 'alta')).toBe('baja');
    }
  });

  it('sin fijar, sigue R12', () => {
    expect(calcularPrioridad('sin_decidir', '2026-11-24', '2026-11-23', null)).toBe('alta');
    expect(calcularPrioridad('sin_decidir', undefined, '2026-11-23')).toBe('media');
  });

  it('se fija al crear y se cambia o se quita al editar', () => {
    const p = Postulacion.crear(
      { aviso: AVISO, origen: 'formulario', prioridadFijada: 'alta', etiquetas: ['Investigación'] },
      deps,
    );
    expect(p.prioridad(deps.reloj)).toBe('alta');
    expect(p.datos().etiquetas).toEqual(['investigacion']);
    p.editar({ prioridad: 'baja' }, deps.reloj);
    expect(p.prioridad(deps.reloj)).toBe('baja');
    p.editar({ prioridad: null }, deps.reloj);
    expect(p.prioridad(deps.reloj)).toBe('media');
    expect(p.datos().prioridadFijada).toBeUndefined();
  });

  it('una prioridad desconocida es VALIDACION y no cambia nada', () => {
    const p = enEstado('sin_decidir', deps);
    expect(() => p.editar({ prioridad: 'urgente' as never, etiquetas: ['nueva'] }, deps.reloj)).toThrow(
      DatoInvalido,
    );
    expect(p.datos().etiquetas).toEqual([]);
  });
});

describe('editar etiquetas y aviso', () => {
  it('las etiquetas se reemplazan completas', () => {
    const p = enEstado('postulado', deps, { etiquetas: ['remoto'] });
    p.editar({ etiquetas: ['Investigación', 'práctica'] }, deps.reloj);
    expect(p.datos().etiquetas).toEqual(['investigacion', 'practica']);
    p.editar({ etiquetas: [] }, deps.reloj);
    expect(p.datos().etiquetas).toEqual([]);
  });

  it('stack, requisitos y sueldo publicado se cambian y null los borra', () => {
    const p = enEstado('sin_decidir', deps);
    p.editar(
      { stack: ['Python', 'MATLAB'], requisitos: 'Inglés', sueldoPublicado: 'A convenir' },
      deps.reloj,
    );
    expect(p.aviso).toMatchObject({
      stack: ['Python', 'MATLAB'],
      requisitos: 'Inglés',
      sueldoPublicado: 'A convenir',
    });
    p.editar({ requisitos: null }, deps.reloj);
    expect(p.aviso.requisitos).toBeUndefined();
    expect(p.aviso.stack).toEqual(['Python', 'MATLAB']);
    p.editar({ stack: [], sueldoPublicado: null }, deps.reloj);
    expect(p.aviso).not.toHaveProperty('stack');
    expect(p.aviso).not.toHaveProperty('sueldoPublicado');
    expect(p.aviso.titulo).toBe(AVISO.titulo);
  });
});
