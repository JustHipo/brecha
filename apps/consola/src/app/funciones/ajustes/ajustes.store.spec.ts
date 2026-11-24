import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { Ia, type Conexiones, type Credenciales } from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { EstadoIaStore } from '../conexiones/estado-ia.store';
import { AjustesStore } from './ajustes.store';

const SIN_NADA: Credenciales = {
  correo: { configurado: false, usuario: null },
  openai: { configurado: false },
};
const CON_CORREO: Credenciales = {
  correo: { configurado: true, usuario: 'j***@gmail.com' },
  openai: { configurado: false },
};

describe('AjustesStore', () => {
  let ia: {
    credenciales: ReturnType<typeof vi.fn>;
    guardarCorreo: ReturnType<typeof vi.fn>;
    guardarOpenai: ReturnType<typeof vi.fn>;
    borrarCredencial: ReturnType<typeof vi.fn>;
  };
  let estadoIa: { conexiones: WritableSignal<Conexiones | null>; cargar: ReturnType<typeof vi.fn> };
  let store: AjustesStore;

  beforeEach(async () => {
    ia = {
      credenciales: vi.fn(() => of(SIN_NADA)),
      guardarCorreo: vi.fn(() => of({ configurado: true, usuario: 'j***@gmail.com' })),
      guardarOpenai: vi.fn(() => of({ configurado: true })),
      borrarCredencial: vi.fn(() => of(null)),
    };
    estadoIa = {
      conexiones: signal<Conexiones | null>({
        correo: { configurado: false, ultimaRevision: null, ultimoError: null, cadaMinutos: 15 },
      } as Conexiones),
      cargar: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Ia, useValue: ia },
        { provide: EstadoIaStore, useValue: estadoIa },
        AjustesStore,
      ],
    });
    store = TestBed.inject(AjustesStore);
    await store.cargar();
  });

  it('carga qué credenciales hay y la frecuencia del vigía, sin secretos', () => {
    expect(store.credenciales()).toEqual(SIN_NADA);
    expect(store.vigiaMinutos()).toBe(15);
    expect(store.operacion()).toEqual({ correo: 'quieta', openai: 'quieta' });
  });

  it('guardar el correo lo prueba, recarga y avisa al indicador de la IA', async () => {
    ia.credenciales.mockReturnValue(of(CON_CORREO));
    const ok = await store.guardarCorreo('  juan@gmail.com ', 'abcd efgh ijkl mnop');
    expect(ok).toBe(true);
    expect(ia.guardarCorreo).toHaveBeenCalledWith('juan@gmail.com', 'abcd efgh ijkl mnop');
    expect(store.resultado().correo).toEqual({ tipo: 'guardada' });
    expect(store.credenciales()?.correo.usuario).toBe('j***@gmail.com');
    expect(estadoIa.cargar).toHaveBeenCalled();
    expect(store.operacion().correo).toBe('quieta');
  });

  it('mientras se prueba, la operación queda en «probando»', async () => {
    let soltar!: () => void;
    ia.guardarOpenai.mockReturnValue(
      new Observable((s) => {
        soltar = () => {
          s.next({ configurado: true });
          s.complete();
        };
      }),
    );
    const p = store.guardarOpenai('sk-prueba-123456');
    expect(store.operacion().openai).toBe('probando');
    soltar();
    await p;
    expect(store.operacion().openai).toBe('quieta');
  });

  it('una credencial que no pasa la prueba muestra el mensaje del servidor', async () => {
    ia.guardarOpenai.mockReturnValue(
      throwError(
        () => new ErrorDeApi('CREDENCIAL_INVALIDA', 'OpenAI rechazó la llave', 400, 'llave'),
      ),
    );
    const ok = await store.guardarOpenai('sk-mala-000000');
    expect(ok).toBe(false);
    expect(store.resultado().openai).toMatchObject({
      tipo: 'error',
      mensaje: 'OpenAI rechazó la llave',
      error: { codigo: 'CREDENCIAL_INVALIDA' },
    });
    expect(ia.credenciales).toHaveBeenCalledTimes(1);
  });

  it('otros errores no traen mensaje propio: se muestra la clave traducida', async () => {
    ia.guardarCorreo.mockReturnValue(
      throwError(() => new ErrorDeApi('PROHIBIDO', 'Solo desde la consola', 403)),
    );
    await store.guardarCorreo('juan@gmail.com', 'abcdefghijklmnop');
    expect(store.resultado().correo).toMatchObject({ tipo: 'error', mensaje: null });
  });

  it('borrar llama al DELETE y recarga', async () => {
    const ok = await store.borrar('openai');
    expect(ok).toBe(true);
    expect(ia.borrarCredencial).toHaveBeenCalledWith('openai');
    expect(store.resultado().openai).toEqual({ tipo: 'borrada' });
    expect(ia.credenciales).toHaveBeenCalledTimes(2);
  });

  it('sin la API de IA queda apagada y no hay frecuencia del vigía', async () => {
    ia.credenciales.mockReturnValue(
      throwError(() => new ErrorDeApi('IA_APAGADA', 'no responde', 502)),
    );
    estadoIa.conexiones.set(null);
    await store.cargar();
    expect(store.apagada()).toBe(true);
    expect(store.vigiaMinutos()).toBeNull();
  });
});
