import { describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { TransicionInvalida } from './errores';
import { ESTADOS, esTerminal, puedeIrA, type EstadoPostulacion } from './estado';
import { enEstado } from './fabrica.prueba';

/** Tabla de PLAN §11.2, escrita a mano para no copiar la del código. */
const VALIDAS: Record<EstadoPostulacion, EstadoPostulacion[]> = {
  sin_decidir: ['por_postular', 'postulado', 'descartado'],
  por_postular: ['postulado', 'sin_decidir', 'descartado'],
  postulado: ['en_proceso', 'entrevista', 'rechazado', 'descartado'],
  en_proceso: ['entrevista', 'rechazado', 'descartado'],
  entrevista: ['oferta', 'rechazado', 'descartado'],
  oferta: ['aceptada', 'rechazado', 'descartado'],
  descartado: ['sin_decidir'],
  rechazado: [],
  aceptada: [],
};

const PARES = ESTADOS.flatMap((de) => ESTADOS.map((a) => [de, a, VALIDAS[de].includes(a)] as const));

describe('R1: las 81 transiciones', () => {
  it('hay 81 pares', () => expect(PARES).toHaveLength(81));

  it.each(PARES)('%s → %s válida=%s', (de, a, valida) => {
    const deps = depsDePrueba();
    const p = enEstado(de, deps);
    expect(puedeIrA(de, a)).toBe(valida);
    const mover = () => p.cambiarEstado(a, { motivo: 'motivo', origen: 'importacion' }, deps);
    if (valida) {
      mover();
      expect(p.estado).toBe(a);
    } else {
      expect(mover).toThrow(TransicionInvalida);
      expect(p.estado).toBe(de);
    }
  });

  it('solo rechazado y aceptada son terminales', () => {
    expect(ESTADOS.filter(esTerminal)).toEqual(['aceptada', 'rechazado']);
  });
});
