import { TestBed } from '@angular/core/testing';
import type { Detalle } from '@brecha/contratos';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { Api, type SenalPendiente } from '../../nucleo/api/api.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Eventos } from '../../nucleo/eventos/eventos.service';
import { TableroStore } from '../tablero/tablero.store';
import { BandejaStore } from './bandeja.store';

function senal(extra: Partial<SenalPendiente> = {}): SenalPendiente {
  return {
    id: 's1',
    fuente: 'correo',
    plataforma: 'getonboard',
    resumen: 'Te invitamos a una entrevista',
    estadoSugerido: 'entrevista',
    confianza: 0.9,
    recibidaEn: '2026-11-23T12:00:00.000Z',
    remitente: 'rrhh@ficticia.test',
    asunto: 'Entrevista',
    empresaDetectada: 'Ficticia',
    cargoDetectado: 'Backend',
    candidatas: [],
    estado: 'pendiente',
    resueltaEn: null,
    creadaEn: '2026-11-23T12:00:00.000Z',
    ...extra,
  };
}

const detalle = { id: 'p1', empresa: 'Ficticia', titulo: 'Backend' } as unknown as Detalle;

describe('BandejaStore', () => {
  let api: {
    bandeja: ReturnType<typeof vi.fn>;
    asociarSenal: ReturnType<typeof vi.fn>;
    crearDesdeSenal: ReturnType<typeof vi.fn>;
    descartarSenal: ReturnType<typeof vi.fn>;
  };
  let tablero: { actualizar: ReturnType<typeof vi.fn> };
  let flujo: Subject<unknown>;
  let store: BandejaStore;

  beforeEach(async () => {
    api = {
      bandeja: vi.fn(() => of([senal(), senal({ id: 's2', resumen: 'Otra' })])),
      asociarSenal: vi.fn(() => of(detalle)),
      crearDesdeSenal: vi.fn(() => of(detalle)),
      descartarSenal: vi.fn(() => of(senal({ estado: 'descartada' }))),
    };
    tablero = { actualizar: vi.fn() };
    flujo = new Subject();
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: Eventos, useValue: { flujo: () => flujo } },
        { provide: TableroStore, useValue: tablero },
      ],
    });
    store = TestBed.inject(BandejaStore);
    await store.cargar();
  });

  it('carga las señales pendientes y las cuenta', () => {
    expect(store.estado()).toBe('listo');
    expect(store.conteo()).toBe(2);
  });

  it('asociar llama a la API, saca la señal y actualiza el tablero', async () => {
    const r = await store.asociar(store.pendientes()[0]!, ['p1']);
    expect(r).toMatchObject({ ok: true, detalle: { id: 'p1' } });
    expect(api.asociarSenal).toHaveBeenCalledWith('s1', ['p1']);
    expect(store.pendientes().map((s) => s.id)).toEqual(['s2']);
    expect(tablero.actualizar).toHaveBeenCalledWith(detalle);
    expect(store.ocupadas().size).toBe(0);
  });

  it('crear manda el aviso con los datos de la señal', async () => {
    const aviso = {
      titulo: 'Backend',
      empresa: 'Ficticia',
      url: 'https://ejemplo.test/a',
      plataforma: 'getonboard' as const,
    };
    const r = await store.crear(store.pendientes()[0]!, aviso);
    expect(r.ok).toBe(true);
    expect(api.crearDesdeSenal).toHaveBeenCalledWith('s1', aviso);
    expect(store.conteo()).toBe(1);
  });

  it('descartar la saca de la bandeja', async () => {
    const r = await store.descartar(store.pendientes()[1]!);
    expect(r.ok).toBe(true);
    expect(api.descartarSenal).toHaveBeenCalledWith('s2');
    expect(store.pendientes().map((s) => s.id)).toEqual(['s1']);
  });

  it('si la API rechaza, la señal se queda y vuelve el error', async () => {
    api.asociarSenal.mockReturnValue(throwError(() => new ErrorDeApi('YA_EXISTE', 'ya está', 409)));
    const r = await store.asociar(store.pendientes()[0]!, ['p1']);
    expect(r).toMatchObject({ ok: false, error: { codigo: 'YA_EXISTE' } });
    expect(store.conteo()).toBe(2);
    expect(tablero.actualizar).not.toHaveBeenCalled();
  });

  it('con NO_ENCONTRADO recarga: otra ventana ya la resolvió', async () => {
    api.asociarSenal.mockReturnValue(
      throwError(() => new ErrorDeApi('NO_ENCONTRADO', 'no está', 404)),
    );
    api.bandeja.mockReturnValue(of([senal({ id: 's2' })]));
    await store.asociar(store.pendientes()[0]!, ['p1']);
    expect(api.bandeja).toHaveBeenCalledTimes(2);
    expect(store.conteo()).toBe(1);
  });

  it('un evento del flujo vuelve a pedir la bandeja', async () => {
    vi.useFakeTimers();
    try {
      await Promise.resolve();
      api.bandeja.mockReturnValue(of([senal(), senal({ id: 's2' }), senal({ id: 's3' })]));
      flujo.next({ tipo: 'senal.sin_asociar' });
      await vi.advanceTimersByTimeAsync(400);
      expect(store.conteo()).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('si la API no responde queda en error', async () => {
    api.bandeja.mockReturnValue(throwError(() => new ErrorDeApi('RED', 'sin red', 0)));
    await store.cargar();
    expect(store.estado()).toBe('error');
    expect(store.error()?.codigo).toBe('RED');
  });
});

describe('BandejaStore sin flujo', () => {
  it('no falla si el flujo no emite', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { bandeja: () => of([]) } },
        { provide: Eventos, useValue: { flujo: () => NEVER } },
        { provide: TableroStore, useValue: { actualizar: vi.fn() } },
      ],
    });
    const store = TestBed.inject(BandejaStore);
    await store.cargar();
    expect(store.conteo()).toBe(0);
  });
});
