import { describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { DatoInvalido } from './errores';
import { Paso } from './paso';

const P1 = '01a209db-369f-7d65-8269-6396b74a0753';
const P2 = '01a209db-36b2-7e81-930f-07103ff1a8c1';
const BASE = {
  postulacionIds: [P1],
  descripcion: 'Completar el test de personalidad',
  fuente: 'correo',
  registradoPor: 'vigia',
};

describe('Paso (docs/diseno/pasos.md, R15 a R20)', () => {
  it('se crea pendiente, con texto libre, y avisa con prioridad alta (R18)', () => {
    const d = depsDePrueba();
    const p = Paso.crear(
      {
        ...BASE,
        detalle: 'Etapa 2 de Chiletrabajos',
        plazo: '2026-11-30',
        enlace: 'https://www.chiletrabajos.cl/test/abc',
        referenciaExterna: '<a@b>',
        pedidoEn: new Date('2026-11-23T10:03:05Z'),
      },
      d,
    );
    expect(p.datos()).toMatchObject({
      estado: 'pendiente',
      descripcion: 'Completar el test de personalidad',
      plazo: '2026-11-30',
      referenciaExterna: '<a@b>',
      version: 0,
    });
    expect(p.datos().pedidoEn.toISOString()).toBe('2026-11-23T10:03:05.000Z');
    const [evento] = p.sacarEventos();
    expect(evento).toMatchObject({ tipo: 'paso.detectado', prioridad: 'alta' });
    expect(evento!.datos).toMatchObject({ postulacionIds: [P1], fuente: 'correo' });
  });

  it('R15: pide al menos una postulación válida y una descripción de 3 a 120 caracteres', () => {
    const d = depsDePrueba();
    expect(() => Paso.crear({ ...BASE, postulacionIds: [] }, d)).toThrow(DatoInvalido);
    expect(() => Paso.crear({ ...BASE, postulacionIds: ['x'] }, d)).toThrow(DatoInvalido);
    expect(() => Paso.crear({ ...BASE, descripcion: 'ok' }, d)).toThrow(DatoInvalido);
    expect(() => Paso.crear({ ...BASE, descripcion: 'x'.repeat(121) }, d)).toThrow(DatoInvalido);
    expect(() => Paso.crear({ ...BASE, fuente: 'paloma' }, d)).toThrow(DatoInvalido);
    expect(() => Paso.crear({ ...BASE, registradoPor: 'nadie' }, d)).toThrow(DatoInvalido);
    expect(() => Paso.crear({ ...BASE, plazo: '30-11-2026' }, d)).toThrow(DatoInvalido);
    expect(() => Paso.crear({ ...BASE, enlace: 'javascript:alert(1)' }, d)).toThrow(DatoInvalido);
    expect(() => Paso.crear({ ...BASE, estado: 'descartado' }, d)).toThrow(DatoInvalido);
    expect(() => Paso.crear({ ...BASE, contactoRedId: 'no' }, d)).toThrow(DatoInvalido);
  });

  it('R15: las postulaciones repetidas se juntan', () => {
    const p = Paso.crear({ ...BASE, postulacionIds: [P1, P2, P1] }, depsDePrueba());
    expect(p.postulacionIds).toEqual([P1, P2]);
    expect(p.toca([P2])).toBe(true);
    expect(p.toca(['otra'])).toBe(false);
  });

  it('R16: se puede crear ya hecho (sin aviso), con el cierre de quien lo registró', () => {
    const p = Paso.crear(
      { ...BASE, estado: 'hecho', registradoPor: 'ia', fuente: 'portal', nota: 'Formulario lleno' },
      depsDePrueba(),
    );
    expect(p.datos().cierre).toMatchObject({ por: 'ia', nota: 'Formulario lleno' });
    expect(p.sacarEventos()).toEqual([]);
  });

  it('R16: hecho, reabrir y descartar, guardando quién y cuándo; no repite el mismo estado', () => {
    const d = depsDePrueba();
    const p = Paso.crear(BASE, d);
    p.sacarEventos();
    p.resolver('hecho', { por: 'persona', nota: 'Listo' }, d.reloj);
    expect(p.datos()).toMatchObject({ estado: 'hecho', cierre: { por: 'persona', nota: 'Listo' } });
    expect(p.sacarEventos()[0]).toMatchObject({ tipo: 'paso.resuelto', prioridad: 'baja' });
    expect(() => p.resolver('hecho', { por: 'persona' }, d.reloj)).toThrow(DatoInvalido);
    p.resolver('pendiente', { por: 'ia' }, d.reloj);
    expect(p.datos().cierre).toBeUndefined();
    p.resolver('descartado', { por: 'ia' }, d.reloj);
    expect(p.datos().cierre?.por).toBe('ia');
    expect(() => p.resolver('borrado', { por: 'ia' }, d.reloj)).toThrow(DatoInvalido);
  });

  it('R20: un correo con confianza alta lo cierra; con baja deja la sugerencia', () => {
    const d = depsDePrueba();
    const a = Paso.crear(BASE, d);
    expect(a.cumplidoPorCorreo(0.95, 0.9, '<b@c>', d.reloj)).toBe('cerrado');
    expect(a.datos().cierre).toMatchObject({ por: 'correo', referenciaExterna: '<b@c>' });
    expect(a.cumplidoPorCorreo(0.95, 0.9, '<b@c>', d.reloj)).toBe('ignorado');

    const b = Paso.crear(BASE, d);
    expect(b.cumplidoPorCorreo(0.7, 0.9, '<b@c>', d.reloj)).toBe('sugerido');
    expect(b.datos()).toMatchObject({ estado: 'pendiente', sugerenciaCierre: { confianza: 0.7 } });
    b.resolver('hecho', { por: 'persona' }, d.reloj);
    expect(b.datos().sugerenciaCierre).toBeUndefined();
  });

  it('R19: un recordatorio actualiza plazo y detalle sin crear otro paso', () => {
    const d = depsDePrueba();
    const p = Paso.crear(BASE, d);
    p.recordar({ plazo: '2026-12-02', detalle: 'Te quedan 2 días' }, d.reloj);
    expect(p.datos()).toMatchObject({ plazo: '2026-12-02', detalle: 'Te quedan 2 días' });
    expect(() => p.recordar({ plazo: 'mañana' }, d.reloj)).toThrow(DatoInvalido);
  });

  it('editar cambia el texto y las postulaciones; null borra plazo, detalle y enlace', () => {
    const d = depsDePrueba();
    const p = Paso.crear({ ...BASE, plazo: '2026-11-30', detalle: 'x x x', enlace: 'https://a.test' }, d);
    p.editar({ descripcion: 'Mandar el CV a Daniel', plazo: null, detalle: null, enlace: null }, d.reloj);
    p.editar({ postulacionIds: [P1, P2] }, d.reloj);
    const x = p.datos();
    expect(x.descripcion).toBe('Mandar el CV a Daniel');
    expect(x.plazo).toBeUndefined();
    expect(x.detalle).toBeUndefined();
    expect(x.enlace).toBeUndefined();
    expect(x.postulacionIds).toEqual([P1, P2]);
    expect(() => p.editar({ postulacionIds: [] }, d.reloj)).toThrow(DatoInvalido);
  });

  it('reconstituir no emite eventos y marcarGuardado fija la versión', () => {
    const d = depsDePrueba();
    const p = Paso.reconstituir(Paso.crear(BASE, d).datos());
    expect(p.sacarEventos()).toEqual([]);
    expect(p.creado).toBe(false);
    p.marcarGuardado(3);
    expect(p.version).toBe(3);
  });
});
