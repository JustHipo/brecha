import { TestBed } from '@angular/core/testing';
import type { Detalle } from '@brecha/contratos';
import { NEVER, of, throwError } from 'rxjs';
import { Api, type ContactoRed } from '../../nucleo/api/api.service';
import { Ia, type AvisoIaDetalle } from '../../nucleo/api/ia.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { Eventos } from '../../nucleo/eventos/eventos.service';
import { TableroStore } from '../tablero/tablero.store';
import { FichaStore } from './ficha.store';

function detalle(avisoId?: string): Detalle {
  return {
    id: 'p1',
    empresa: 'Ficticia',
    titulo: 'Backend',
    aviso: {
      titulo: 'Backend',
      empresa: 'Ficticia',
      url: 'https://ejemplo.test/1',
      plataforma: 'linkedin',
      modalidad: 'remoto',
      ubicacion: '',
      ...(avisoId ? { avisoId } : {}),
    },
  } as unknown as Detalle;
}

const camila = {
  id: 'c1',
  nombre: 'Camila',
  pendiente: 'responder',
  postulacionIds: ['p1'],
} as unknown as ContactoRed;

describe('FichaStore: con quién hablas y el análisis del aviso', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let ia: { aviso: ReturnType<typeof vi.fn> };
  let store: FichaStore;

  function preparar(avisoId?: string) {
    api = {
      ver: vi.fn(() => of(detalle(avisoId))),
      red: vi.fn(() => of({ items: [camila], resumen: { total: 1, porResponder: 1 } as never })),
      verContactoRed: vi.fn(() =>
        of({
          ...camila,
          interacciones: [
            {
              id: 'i1',
              tipo: 'mensaje_recibido',
              resumen: 'Hola',
              ocurridaEn: '2026-11-22T10:00:00.000Z',
              origen: 'ia',
            },
          ],
        }),
      ),
    };
    ia = {
      aviso: vi.fn(() => of({ id: 'a1', sueldo: '$2.500.000', calce: 81 } as AvisoIaDetalle)),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: Ia, useValue: ia },
        { provide: Eventos, useValue: { flujo: () => NEVER } },
        { provide: TableroStore, useValue: { actualizar: vi.fn() } },
        FichaStore,
      ],
    });
    store = TestBed.inject(FichaStore);
  }

  it('trae la red ligada a la postulación y su conversación', async () => {
    preparar();
    await store.cargar('p1');
    await vi.waitFor(() => expect(store.conversaciones()).toHaveLength(1));
    expect(api['red']).toHaveBeenCalledWith({ postulacionId: 'p1' });
    expect(store.red().map((c) => c.id)).toEqual(['c1']);
    expect(store.conversaciones()[0]).toMatchObject({
      contacto: { id: 'c1', nombre: 'Camila' },
      i: { tipo: 'mensaje_recibido' },
    });
  });

  it('sin avisoId no llama a la API de IA', async () => {
    preparar();
    await store.cargar('p1');
    expect(ia.aviso).not.toHaveBeenCalled();
    expect(store.estadoAvisoIa()).toBe('sin_aviso');
  });

  it('con avisoId trae el análisis del aviso', async () => {
    preparar('a1');
    await store.cargar('p1');
    await vi.waitFor(() => expect(store.estadoAvisoIa()).toBe('listo'));
    expect(ia.aviso).toHaveBeenCalledWith('a1');
    expect(store.avisoIa()?.calce).toBe(81);
  });

  it('con la API de IA apagada la ficha sigue y lo dice', async () => {
    preparar('a1');
    ia.aviso.mockReturnValue(throwError(() => new ErrorDeApi('IA_APAGADA', 'no', 502)));
    await store.cargar('p1');
    await vi.waitFor(() => expect(store.estadoAvisoIa()).toBe('apagada'));
    expect(store.estado()).toBe('listo');
    expect(store.avisoIa()).toBeNull();
  });

  it('si la red falla, la ficha sigue y guarda el error', async () => {
    preparar();
    api['red']!.mockReturnValue(throwError(() => new ErrorDeApi('RED', 'sin red', 0)));
    await store.cargar('p1');
    await vi.waitFor(() => expect(store.errorRed()?.codigo).toBe('RED'));
    expect(store.estado()).toBe('listo');
  });
});
