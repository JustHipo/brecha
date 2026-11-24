import { describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { DatoInvalido } from '../../postulaciones/dominio/errores';
import { ContactoDeRed, perfilNormalizado } from './contacto-de-red';

const deps = depsDePrueba();
const nuevo = () =>
  ContactoDeRed.crear(
    { nombre: 'Ana Ficticia', perfilUrl: 'linkedin.com/in/Ana-Ficticia/', empresa: 'Ficticia' },
    deps,
  );
const en = (iso: string) => new Date(iso);

describe('ContactoDeRed', () => {
  it('normaliza el perfil y rechaza lo que no es LinkedIn', () => {
    expect(perfilNormalizado('https://cl.linkedin.com/in/ana-ficticia?trk=x')).toBe(
      'https://www.linkedin.com/in/ana-ficticia',
    );
    expect(nuevo().datos().perfilUrl).toBe('https://www.linkedin.com/in/ana-ficticia');
    expect(() => perfilNormalizado('https://ejemplo.test/ana')).toThrow(DatoInvalido);
  });

  it('las solicitudes mueven la conexión y manda la más reciente aunque llegue tarde', () => {
    const c = nuevo();
    c.registrarInteraccion(
      {
        tipo: 'solicitud_enviada',
        resumen: 'Le mandé solicitud',
        ocurridaEn: en('2026-11-10T12:00:00Z'),
        origen: 'ia',
      },
      deps,
    );
    expect(c.datos().conexion).toBe('solicitud_enviada');
    expect(c.pendiente()).toBe('esperando');
    c.registrarInteraccion(
      { tipo: 'solicitud_aceptada', resumen: 'Aceptó', ocurridaEn: en('2026-11-12T12:00:00Z'), origen: 'ia' },
      deps,
    );
    expect(c.datos().conexion).toBe('conectados');
    expect(c.pendiente()).toBeNull();
    c.registrarInteraccion(
      { tipo: 'solicitud_enviada', resumen: 'Vieja', ocurridaEn: en('2026-11-01T12:00:00Z'), origen: 'ia' },
      deps,
    );
    expect(c.datos().conexion).toBe('conectados');
  });

  it('quién debe responder sale del último mensaje', () => {
    const c = nuevo();
    c.registrarInteraccion(
      {
        tipo: 'mensaje_enviado',
        resumen: 'Le pregunté por el proceso',
        ocurridaEn: en('2026-11-15T12:00:00Z'),
        origen: 'ia',
      },
      deps,
    );
    expect(c.pendiente()).toBe('esperando');
    c.registrarInteraccion(
      {
        tipo: 'mensaje_recibido',
        resumen: 'Me respondió',
        ocurridaEn: en('2026-11-16T12:00:00Z'),
        origen: 'ia',
      },
      deps,
    );
    expect(c.pendiente()).toBe('responder');
    expect(c.ultimaInteraccion()?.resumen).toBe('Me respondió');
  });

  it('una solicitud recibida queda por responder', () => {
    const c = nuevo();
    c.registrarInteraccion({ tipo: 'solicitud_recibida', resumen: 'Me invitó', origen: 'ia' }, deps);
    expect(c.pendiente()).toBe('responder');
  });

  it('no repite una interacción (misma referencia, o mismo tipo y resumen el mismo día)', () => {
    const c = nuevo();
    const i = {
      tipo: 'mensaje_recibido',
      resumen: 'Hola',
      ocurridaEn: en('2026-11-16T12:00:00Z'),
      origen: 'ia' as const,
    };
    expect(c.registrarInteraccion(i, deps)).toBe(true);
    expect(c.registrarInteraccion({ ...i, ocurridaEn: en('2026-11-16T15:00:00Z') }, deps)).toBe(false);
    expect(c.registrarInteraccion({ ...i, resumen: 'Otro', referenciaExterna: 'm1' }, deps)).toBe(true);
    expect(c.registrarInteraccion({ ...i, resumen: 'Otro más', referenciaExterna: 'm1' }, deps)).toBe(false);
    expect(c.datos().interacciones).toHaveLength(2);
  });

  it('valida tipo, resumen y fecha futura', () => {
    const c = nuevo();
    expect(() => c.registrarInteraccion({ tipo: 'saludo', resumen: 'x', origen: 'ia' }, deps)).toThrow(
      DatoInvalido,
    );
    expect(() => c.registrarInteraccion({ tipo: 'nota', resumen: '', origen: 'ia' }, deps)).toThrow(
      DatoInvalido,
    );
    expect(() =>
      c.registrarInteraccion(
        { tipo: 'nota', resumen: 'x', ocurridaEn: en('2030-01-01T00:00:00Z'), origen: 'ia' },
        deps,
      ),
    ).toThrow(DatoInvalido);
  });

  it('seguimiento, notas y postulaciones', () => {
    const c = nuevo();
    c.actualizar({ seguimiento: deps.reloj.hoy(), notas: 'Reclutadora de Ficticia' }, deps.reloj);
    expect(c.seguimientoVencido(deps.reloj)).toBe(true);
    c.actualizar({ seguimiento: null, empresa: '' }, deps.reloj);
    expect(c.datos().seguimiento).toBeUndefined();
    expect(c.datos().empresa).toBeUndefined();
    expect(() => c.actualizar({ seguimiento: '2026-02-30' }, deps.reloj)).toThrow(DatoInvalido);
    c.vincularPostulacion('p1', deps.reloj);
    c.vincularPostulacion('p1', deps.reloj);
    expect(c.datos().postulacionIds).toEqual(['p1']);
    c.desvincularPostulacion('p1', deps.reloj);
    expect(c.datos().postulacionIds).toEqual([]);
  });

  it('sin perfil de LinkedIn se crea igual y el perfil se completa después, pero no se cambia por otro', () => {
    const c = ContactoDeRed.crear({ nombre: 'Bruno Ficticio', empresa: 'Universidad Ficticia' }, deps);
    expect(c.datos().perfilUrl).toBeUndefined();
    c.actualizar({ perfilUrl: 'linkedin.com/in/bruno' }, deps.reloj);
    expect(c.datos().perfilUrl).toBe('https://www.linkedin.com/in/bruno');
    expect(() => c.actualizar({ perfilUrl: 'linkedin.com/in/otro' }, deps.reloj)).toThrow(DatoInvalido);
    c.actualizar({ perfilUrl: 'https://www.linkedin.com/in/bruno/' }, deps.reloj);
    expect(c.datos().perfilUrl).toBe('https://www.linkedin.com/in/bruno');
  });
});
