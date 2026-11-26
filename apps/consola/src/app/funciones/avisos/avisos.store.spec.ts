import { TestBed } from '@angular/core/testing';
import type { Detalle } from '@brecha/contratos';
import { of, throwError } from 'rxjs';
import { Api } from '../../nucleo/api/api.service';
import { Ia, type AvisoIa } from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { TableroStore } from '../tablero/tablero.store';
import { AvisosStore, aPostulacion } from './avisos.store';

function aviso(extra: Partial<AvisoIa> = {}): AvisoIa {
  return {
    id: 'a1',
    url: 'https://ejemplo.test/aviso',
    titulo: 'Backend NestJS',
    empresa: 'Ficticia',
    plataforma: 'getonboard',
    modalidad: 'remoto',
    ubicacion: 'Santiago',
    origen: 'getonboard',
    cita: 'Get on Board',
    stack: ['NestJS'],
    sueldo: null,
    publicadoEn: null,
    analizado: true,
    calce: 72,
    brechas: ['Docker'],
    postulacionId: null,
    ...extra,
  };
}

describe('AvisosStore', () => {
  let api: { crear: ReturnType<typeof vi.fn> };
  let ia: { avisos: ReturnType<typeof vi.fn>; vincular: ReturnType<typeof vi.fn> };
  let store: AvisosStore;

  beforeEach(async () => {
    api = { crear: vi.fn(() => of({ id: 'p1' } as unknown as Detalle)) };
    ia = {
      avisos: vi.fn(() =>
        of({
          items: [aviso()],
          conteo: { total: 1, analizados: 1, conVector: 0, vinculados: 0 },
        }),
      ),
      vincular: vi.fn((id: string, postulacionId: string) =>
        of({ ...aviso({ id, postulacionId }), texto: 't', cumple: [], requisitos: [] }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: Ia, useValue: ia },
        { provide: TableroStore, useValue: { actualizar: vi.fn() } },
      ],
    });
    store = TestBed.inject(AvisosStore);
    await store.cargar();
  });

  it('traduce el aviso a la postulación del núcleo', () => {
    expect(aPostulacion(aviso({ plataforma: 'rara', modalidad: 'x' }))).toEqual({
      aviso: {
        titulo: 'Backend NestJS',
        empresa: 'Ficticia',
        url: 'https://ejemplo.test/aviso',
        plataforma: 'otra',
        modalidad: 'no_indica',
        ubicacion: 'Santiago',
      },
    });
  });

  it('seguir crea la postulación y la liga al aviso', async () => {
    const r = await store.seguir(store.items()[0]!);
    expect(r).toEqual({ ok: true, postulacionId: 'p1', yaExistia: false });
    expect(ia.vincular).toHaveBeenCalledWith('a1', 'p1');
    expect(store.items()[0]?.postulacionId).toBe('p1');
  });

  it('con YA_EXISTE usa la postulación que ya sigue ese aviso', async () => {
    api.crear.mockReturnValue(
      throwError(() => new ErrorDeApi('YA_EXISTE', 'ya', 409, undefined, 'p9')),
    );
    const r = await store.seguir(store.items()[0]!);
    expect(r).toEqual({ ok: true, postulacionId: 'p9', yaExistia: true });
    expect(ia.vincular).toHaveBeenCalledWith('a1', 'p9');
  });

  it('si el vínculo falla devuelve el id de la postulación creada', async () => {
    ia.vincular.mockReturnValue(
      throwError(() => new ErrorDeApi('NUCLEO_NO_DISPONIBLE', 'no', 503)),
    );
    const r = await store.seguir(store.items()[0]!);
    expect(r).toMatchObject({ ok: false, postulacionId: 'p1' });
  });

  it('manda los filtros a la API', async () => {
    store.filtros.set({ texto: 'nest', calceMinimo: 60 });
    await store.cargar();
    expect(ia.avisos).toHaveBeenLastCalledWith({ texto: 'nest', calceMinimo: 60 });
  });
});
