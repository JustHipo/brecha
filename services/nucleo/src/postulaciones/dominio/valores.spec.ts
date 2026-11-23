import { describe, expect, it } from 'vitest';
import { diasEntre, esFecha } from '../../compartido/dominio/puertos';
import { DatoInvalido } from './errores';
import { crearCanal, crearDinero } from './objetos-valor/valores';
import { calcularPrioridad } from './politica-de-prioridad';

describe('objetos de valor', () => {
  it('canal: email válido si el tipo es email', () => {
    expect(crearCanal({ tipo: 'email', valor: 'rrhh@ejemplo.test' })).toEqual({
      tipo: 'email',
      valor: 'rrhh@ejemplo.test',
    });
    expect(() => crearCanal({ tipo: 'email', valor: 'no-correo' })).toThrow(DatoInvalido);
    expect(() => crearCanal({ tipo: 'paloma', valor: 'x' })).toThrow(DatoInvalido);
  });

  it('dinero: monto > 0 y moneda conocida', () => {
    expect(crearDinero({ monto: 1_700_000, moneda: 'CLP' })).toEqual({
      monto: 1_700_000,
      moneda: 'CLP',
      periodo: 'mes',
      base: 'bruto',
    });
    expect(() => crearDinero({ monto: 0, moneda: 'CLP' })).toThrow(DatoInvalido);
    expect(() => crearDinero({ monto: 10, moneda: 'EUR' })).toThrow(DatoInvalido);
    expect(() => crearDinero({ monto: 10, moneda: 'USD', periodo: 'semana' })).toThrow(DatoInvalido);
    expect(() => crearDinero({ monto: 10, moneda: 'USD', base: 'neto' })).toThrow(DatoInvalido);
  });

  it('fechas', () => {
    expect(esFecha('2026-11-23')).toBe(true);
    expect(esFecha('2026-13-01')).toBe(false);
    expect(diasEntre('2026-11-23', '2026-11-25')).toBe(2);
  });
});

describe('PoliticaDePrioridad (R12)', () => {
  it.each([
    ['postulado', 'alta'],
    ['en_proceso', 'alta'],
    ['entrevista', 'alta'],
    ['oferta', 'alta'],
    ['sin_decidir', 'media'],
    ['por_postular', 'media'],
    ['descartado', 'baja'],
    ['rechazado', 'baja'],
    ['aceptada', 'baja'],
  ] as const)('%s es %s', (estado, prioridad) => {
    expect(calcularPrioridad(estado, undefined, '2026-11-23')).toBe(prioridad);
  });

  it('sin decidir con cierre en 2 días o menos es alta; cerrado o lejos es media', () => {
    expect(calcularPrioridad('sin_decidir', '2026-11-25', '2026-11-23')).toBe('alta');
    expect(calcularPrioridad('por_postular', '2026-11-23', '2026-11-23')).toBe('alta');
    expect(calcularPrioridad('sin_decidir', '2026-11-26', '2026-11-23')).toBe('media');
    expect(calcularPrioridad('sin_decidir', '2026-11-20', '2026-11-23')).toBe('media');
  });
});
