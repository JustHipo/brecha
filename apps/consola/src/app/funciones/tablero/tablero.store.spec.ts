import { TestBed } from '@angular/core/testing';
import type { Detalle, Resumen, Tablero } from '@brecha/contratos';
import { NEVER, of, throwError } from 'rxjs';
import { Api } from '../../nucleo/api/api.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Eventos } from '../../nucleo/eventos/eventos.service';
import { SIN_FILTROS, TableroStore } from './tablero.store';

function tarjeta(extra: Partial<Resumen> = {}): Resumen {
  return {
    id: 'p1',
    titulo: 'Backend',
    empresa: 'Ficticia',
    url: 'https://ejemplo.test/1',
    plataforma: 'linkedin',
    modalidad: 'remoto',
    ubicacion: '',
    cierre: null,
    diasAlCierre: null,
    estado: 'sin_decidir',
    prioridad: 'media',
    prioridadFijada: null,
    etiquetas: [],
    fechaPostulacion: null,
    senalesNuevas: 0,
    discrepanciasAbiertas: 0,
    pasosPendientes: [],
    transicionesPosibles: ['por_postular', 'postulado', 'descartado'],
    version: 0,
    actualizadaEn: '2026-11-23T12:00:00.000Z',
    ...extra,
  };
}

function tablero(t: Resumen): Tablero {
  const estados = [
    'sin_decidir',
    'por_postular',
    'postulado',
    'en_proceso',
    'entrevista',
    'oferta',
    'aceptada',
    'rechazado',
    'descartado',
  ] as const;
  return {
    columnas: estados.map((estado) => ({
      estado,
      total: t.estado === estado ? 1 : 0,
      items: t.estado === estado ? [t] : [],
    })),
  };
}

describe('TableroStore', () => {
  let api: { tablero: ReturnType<typeof vi.fn>; cambiarEstado: ReturnType<typeof vi.fn> };
  let store: TableroStore;

  beforeEach(async () => {
    api = { tablero: vi.fn(() => of(tablero(tarjeta()))), cambiarEstado: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: Eventos, useValue: { flujo: () => NEVER } },
      ],
    });
    store = TestBed.inject(TableroStore);
    await store.cargar();
  });

  it('carga las columnas y cuenta', () => {
    expect(store.estado()).toBe('listo');
    expect(store.total()).toBe(1);
    expect(store.abiertas()).toBe(1);
  });

  it('un movimiento válido queda con lo que respondió la API', async () => {
    const detalle = { ...tarjeta({ estado: 'por_postular', version: 1 }) } as unknown as Detalle;
    api.cambiarEstado.mockReturnValue(of(detalle));
    const r = await store.mover(store.buscar('p1')!, 'por_postular');
    expect(r.ok).toBe(true);
    expect(api.cambiarEstado).toHaveBeenCalledWith('p1', {
      a: 'por_postular',
      origen: 'tablero',
      version: 0,
    });
    expect(store.columna('por_postular')?.items[0]?.version).toBe(1);
    expect(store.columna('sin_decidir')?.items).toHaveLength(0);
  });

  it('con 422 la tarjeta vuelve a su columna', async () => {
    api.cambiarEstado.mockReturnValue(
      throwError(() => new ErrorDeApi('TRANSICION_INVALIDA', 'no', 422, 'a')),
    );
    const r = await store.mover(store.buscar('p1')!, 'entrevista');
    expect(r).toMatchObject({ ok: false, error: { codigo: 'TRANSICION_INVALIDA' } });
    expect(store.columna('sin_decidir')?.items.map((t) => t.id)).toEqual(['p1']);
    expect(store.columna('entrevista')?.items).toHaveLength(0);
  });

  it('con 409 recarga desde la API', async () => {
    api.cambiarEstado.mockReturnValue(throwError(() => new ErrorDeApi('CONFLICTO', 'cambió', 409)));
    api.tablero.mockReturnValue(of(tablero(tarjeta({ estado: 'postulado', version: 3 }))));
    const r = await store.mover(store.buscar('p1')!, 'por_postular');
    expect(r).toMatchObject({ ok: false, error: { codigo: 'CONFLICTO' } });
    expect(api.tablero).toHaveBeenCalledTimes(2);
    expect(store.buscar('p1')).toMatchObject({ estado: 'postulado', version: 3 });
  });

  it('avisa si el movimiento abrió una discrepancia', async () => {
    api.cambiarEstado.mockReturnValue(
      of(tarjeta({ estado: 'postulado', discrepanciasAbiertas: 1 }) as unknown as Detalle),
    );
    const r = await store.mover(store.buscar('p1')!, 'postulado', {
      fechaPostulacion: '2026-11-23',
      canal: { tipo: 'portal', valor: 'x' },
    });
    expect(r).toMatchObject({ ok: true, discrepanciaNueva: true });
  });

  it('filtra por plataforma, prioridad y texto en el cliente', () => {
    store.filtros.set({ ...SIN_FILTROS, plataformas: ['getonboard'] });
    expect(store.columna('sin_decidir')?.items).toHaveLength(0);
    store.filtros.set({ ...SIN_FILTROS, prioridades: ['media'], q: 'ficti' });
    expect(store.columna('sin_decidir')?.items).toHaveLength(1);
    expect(store.hayFiltros()).toBe(true);
  });

  it('filtra por etiqueta y lista las etiquetas en uso', async () => {
    api.tablero.mockReturnValue(of(tablero(tarjeta({ etiquetas: ['investigacion', 'p1'] }))));
    await store.cargar();
    expect(store.etiquetasEnUso()).toEqual(['investigacion', 'p1']);
    store.filtros.set({ ...SIN_FILTROS, etiquetas: ['investigacion'] });
    expect(store.columna('sin_decidir')?.items).toHaveLength(1);
    store.filtros.set({ ...SIN_FILTROS, etiquetas: ['remoto'] });
    expect(store.columna('sin_decidir')?.items).toHaveLength(0);
    expect(store.hayFiltros()).toBe(true);
  });

  it('si la API no responde queda en error', async () => {
    api.tablero.mockReturnValue(throwError(() => new ErrorDeApi('RED', 'sin red', 0)));
    await store.cargar();
    expect(store.estado()).toBe('error');
    expect(store.error()?.codigo).toBe('RED');
  });
});

describe('TableroStore con pasos pendientes (docs/diseno/pasos.md §7)', () => {
  const PASO = { id: 'paso1', descripcion: 'Completar el test', plazo: null, diasAlPlazo: null };
  let api: { tablero: ReturnType<typeof vi.fn>; resolverPaso: ReturnType<typeof vi.fn> };
  let store: TableroStore;

  beforeEach(async () => {
    api = {
      tablero: vi.fn(() => of(tablero(tarjeta({ estado: 'rechazado', pasosPendientes: [PASO] })))),
      resolverPaso: vi.fn(() => of({})),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: Eventos, useValue: { flujo: () => NEVER } },
      ],
    });
    store = TestBed.inject(TableroStore);
    await store.cargar();
  });

  it('cuenta los pasos también en las cerradas y el chip filtra las tarjetas con pasos', () => {
    expect(store.pasosPendientes()).toBe(1);
    expect(store.cerradasConPasos()).toBe(1);
    store.filtros.update((f) => ({ ...f, conPasos: true }));
    expect(store.hayFiltros()).toBe(true);
    expect(store.columna('rechazado')?.items).toHaveLength(1);
  });

  it('«Hecho» saca el paso al tiro y llama a la API; si falla, vuelve', async () => {
    const t = store.buscar('p1')!;
    expect(await store.resolverPaso(t, 'paso1')).toBeNull();
    expect(api.resolverPaso).toHaveBeenCalledWith('paso1', 'hecho');
    expect(store.buscar('p1')?.pasosPendientes).toEqual([]);

    api.resolverPaso.mockReturnValue(throwError(() => new ErrorDeApi('CONFLICTO', 'x', 409)));
    const otra = store.buscar('p1')!;
    store.actualizar({ ...otra, pasosPendientes: [PASO] });
    const error = await store.resolverPaso(store.buscar('p1')!, 'paso1');
    expect(error?.codigo).toBe('CONFLICTO');
    expect(store.buscar('p1')?.pasosPendientes).toEqual([PASO]);
  });

  it('«Deshacer» reabre el paso y recarga el tablero', async () => {
    await store.resolverPaso(store.buscar('p1')!, 'paso1', 'pendiente');
    expect(api.resolverPaso).toHaveBeenCalledWith('paso1', 'pendiente');
    expect(api.tablero).toHaveBeenCalledTimes(2);
  });
});
