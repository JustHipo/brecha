import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { Ia, type AvisoIa, type Respuesta } from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { PreguntarStore } from './preguntar.store';

const aviso: AvisoIa = {
  id: 'a1',
  url: 'https://ejemplo.test/aviso',
  titulo: 'Backend NestJS',
  empresa: 'Ficticia',
  plataforma: 'getonboard',
  modalidad: 'remoto',
  ubicacion: null,
  origen: 'getonboard',
  cita: 'Get on Board',
  stack: ['NestJS'],
  sueldo: null,
  publicadoEn: null,
  analizado: true,
  calce: 80,
  brechas: [],
  postulacionId: null,
};

const respuesta: Respuesta = {
  respuesta: 'El aviso de Ficticia calza mejor.',
  citados: [aviso],
  descartados: 2,
  costoUsd: 0.0012,
};

describe('PreguntarStore', () => {
  let ia: { preguntar: ReturnType<typeof vi.fn> };
  let store: PreguntarStore;

  beforeEach(() => {
    ia = { preguntar: vi.fn(() => of(respuesta)) };
    TestBed.configureTestingModule({ providers: [{ provide: Ia, useValue: ia }] });
    store = TestBed.inject(PreguntarStore);
  });

  it('valida el largo como la API (3 a 500 caracteres)', () => {
    expect(PreguntarStore.valida('  ab ')).toBe(false);
    expect(PreguntarStore.valida('abc')).toBe(true);
    expect(PreguntarStore.valida('x'.repeat(501))).toBe(false);
  });

  it('una pregunta corta no llama a la API', async () => {
    expect(await store.preguntar('hi')).toBeNull();
    expect(ia.preguntar).not.toHaveBeenCalled();
    expect(store.intercambios()).toHaveLength(0);
  });

  it('guarda la respuesta con los avisos citados y suma el costo', async () => {
    const r = await store.preguntar('  ¿Qué aviso calza mejor?  ');
    expect(ia.preguntar).toHaveBeenCalledWith('¿Qué aviso calza mejor?');
    expect(r).toMatchObject({ estado: 'lista', respuesta: respuesta.respuesta, descartados: 2 });
    expect(store.intercambios()[0]?.citados[0]?.id).toBe('a1');
    await store.preguntar('¿Y otro?');
    expect(store.costoTotal()).toBeCloseTo(0.0024);
  });

  it('mientras espera muestra la pregunta y no deja mandar otra', async () => {
    const pendiente = new Subject<Respuesta>();
    ia.preguntar.mockReturnValue(pendiente);
    const p = store.preguntar('¿Qué aviso calza mejor?');
    expect(store.esperando()).toBe(true);
    expect(store.intercambios()[0]).toMatchObject({ estado: 'esperando' });
    expect(await store.preguntar('¿Otra pregunta?')).toBeNull();
    pendiente.next(respuesta);
    pendiente.complete();
    await p;
    expect(store.esperando()).toBe(false);
    expect(store.intercambios()).toHaveLength(1);
  });

  it('IA_NO_DISPONIBLE (503) queda como error y se puede reintentar', async () => {
    ia.preguntar.mockReturnValueOnce(
      throwError(() => new ErrorDeApi('IA_NO_DISPONIBLE', 'Falta la llave de OpenAI', 503)),
    );
    const r = await store.preguntar('¿Qué aviso calza mejor?');
    expect(r).toMatchObject({ estado: 'error', error: { codigo: 'IA_NO_DISPONIBLE' } });
    const otra = await store.reintentar(r!.id);
    expect(otra).toMatchObject({ estado: 'lista' });
    expect(store.intercambios()).toHaveLength(1);
    expect(ia.preguntar).toHaveBeenCalledTimes(2);
  });

  it('limpiar borra la conversación', async () => {
    await store.preguntar('¿Qué aviso calza mejor?');
    store.limpiar();
    expect(store.intercambios()).toHaveLength(0);
  });
});
