import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Ia, type Conexiones } from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { EstadoIaStore } from './estado-ia.store';

function conexiones(ia: Partial<Conexiones['ia']> = {}): Conexiones {
  return {
    correo: { configurado: true, ultimaRevision: null, ultimoError: null, cadaMinutos: 5 },
    ia: {
      proveedor: 'openai',
      configurado: true,
      modelo: 'gpt',
      ultimoError: null,
      enCola: 0,
      clasificados: 3,
      gastoMesUsd: 0.0123,
      llamadasMes: 4,
      ...ia,
    },
    salida: [],
  };
}

describe('EstadoIaStore', () => {
  let ia: { conexiones: ReturnType<typeof vi.fn> };
  let store: EstadoIaStore;

  beforeEach(() => {
    ia = { conexiones: vi.fn(() => of(conexiones())) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Ia, useValue: ia }],
    });
    store = TestBed.inject(EstadoIaStore);
  });

  it('IA lista cuando está configurada y sin errores', async () => {
    expect(store.indicador()).toBe('cargando');
    await store.cargar();
    expect(store.indicador()).toBe('lista');
  });

  it('sin llave o con error queda no disponible y muestra la cola', async () => {
    ia.conexiones.mockReturnValue(of(conexiones({ ultimoError: 'cuota', enCola: 12 })));
    await store.cargar();
    expect(store.indicador()).toBe('no_disponible');
    expect(store.enCola()).toBe(12);
  });

  it('si la API de IA no responde, el servicio está apagado', async () => {
    ia.conexiones.mockReturnValue(throwError(() => new ErrorDeApi('IA_APAGADA', 'x', 502)));
    await store.cargar();
    expect(store.indicador()).toBe('apagada');
  });

  it('sondea cada 60 s sin repetir pedidos', async () => {
    vi.useFakeTimers();
    try {
      store.iniciar();
      store.iniciar();
      await vi.advanceTimersByTimeAsync(0);
      expect(ia.conexiones).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(ia.conexiones).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
