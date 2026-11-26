import { describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { DatoInvalido } from './errores';
import { enEstado } from './fabrica.prueba';
import { SenalPendiente } from './senal-pendiente';

const BASE = {
  fuente: 'correo',
  resumen: 'Te invitamos a una entrevista',
  confianza: 0.8,
  estadoSugerido: 'entrevista',
};

describe('SenalPendiente (Bandeja)', () => {
  it('se crea pendiente, con plataforma otra por defecto y los datos detectados', () => {
    const d = depsDePrueba();
    const p = SenalPendiente.crear(
      { ...BASE, referenciaExterna: '<a@b>', empresaDetectada: 'Ficticia', asunto: 'Entrevista' },
      d,
    );
    expect(p.datos()).toMatchObject({
      estado: 'pendiente',
      plataforma: 'otra',
      empresaDetectada: 'Ficticia',
      referenciaExterna: '<a@b>',
    });
    expect(p.comoSenal()).toMatchObject({
      fuente: 'correo',
      estadoSugerido: 'entrevista',
      referenciaExterna: '<a@b>',
    });
  });

  it('valida fuente, plataforma, confianza, estado y resumen', () => {
    const d = depsDePrueba();
    expect(() => SenalPendiente.crear({ ...BASE, fuente: 'paloma' }, d)).toThrow(DatoInvalido);
    expect(() => SenalPendiente.crear({ ...BASE, plataforma: 'myspace' }, d)).toThrow(DatoInvalido);
    expect(() => SenalPendiente.crear({ ...BASE, confianza: 2 }, d)).toThrow(DatoInvalido);
    expect(() => SenalPendiente.crear({ ...BASE, estadoSugerido: 'x' }, d)).toThrow(DatoInvalido);
    expect(() => SenalPendiente.crear({ ...BASE, resumen: ' ' }, d)).toThrow(DatoInvalido);
  });

  it('se asocia o se descarta una sola vez', () => {
    const d = depsDePrueba();
    const p = SenalPendiente.crear(BASE, d);
    p.asociar('post-1', d.reloj.ahora());
    expect(p.datos()).toMatchObject({ estado: 'asociada', postulacionId: 'post-1' });
    expect(() => p.descartar(d.reloj.ahora())).toThrow(DatoInvalido);
    const q = SenalPendiente.reconstituir(SenalPendiente.crear(BASE, d).datos());
    q.descartar(d.reloj.ahora());
    expect(q.estado).toBe('descartada');
    expect(() => q.exigirPendiente()).toThrow(DatoInvalido);
  });
});

describe('D27 y vincularAviso en el agregado', () => {
  const rechazo = { resumen: 'No continuaremos', estadoSugerido: 'rechazado' as const, confianza: 0.95 };

  it('una señal manual o de la IA no se aplica sola aunque «aplicar señales seguras» esté encendido', () => {
    const d = depsDePrueba();
    for (const fuente of ['manual', 'ia'] as const) {
      const p = enEstado('postulado', d);
      const s = p.registrarSenal({ ...rechazo, fuente }, { ...d, aplicarSeguras: true, umbral: 0.9 });
      expect(s.aplicada).toBe(false);
      expect(p.estado).toBe('postulado');
    }
  });

  it('una señal de la plataforma sí se aplica sola', () => {
    const d = depsDePrueba();
    const p = enEstado('postulado', d);
    p.registrarSenal({ ...rechazo, fuente: 'plataforma' }, { ...d, aplicarSeguras: true, umbral: 0.9 });
    expect(p.estado).toBe('rechazado');
  });

  it('vincularAviso guarda avisoId y calce, y valida el calce', () => {
    const d = depsDePrueba();
    const p = enEstado('postulado', d);
    p.vincularAviso({ avisoId: 'aviso-1', calce: 0.72 }, d.reloj);
    expect(p.aviso).toMatchObject({ avisoId: 'aviso-1', calce: 0.72 });
    expect(() => p.vincularAviso({ calce: 1.5 }, d.reloj)).toThrow(DatoInvalido);
  });
});
