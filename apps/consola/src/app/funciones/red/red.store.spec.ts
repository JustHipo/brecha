import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import {
  Api,
  type ContactoRed,
  type ContactoRedDetalle,
  type ListaDeRed,
} from '../../nucleo/api/api.service';
import { ErrorDeApi } from '../../nucleo/errores/error-de-api';
import { ContactoStore, RedStore, momentoDe } from './red.store';

function contacto(extra: Partial<ContactoRed> = {}): ContactoRed {
  return {
    id: 'c1',
    nombre: 'Camila Rojas',
    perfilUrl: 'https://www.linkedin.com/in/camila-rojas-ficticia',
    titular: 'Talent Partner',
    empresa: 'Ficticia',
    conexion: 'conectados',
    pendiente: 'responder',
    ultimaInteraccion: {
      id: 'i1',
      tipo: 'mensaje_recibido',
      resumen: '¿Tienes tiempo el jueves?',
      ocurridaEn: '2026-11-22T15:00:00.000Z',
      origen: 'ia',
    },
    diasDesdeUltima: 1,
    seguimiento: null,
    seguimientoVencido: false,
    postulacionIds: [],
    notas: null,
    actualizadoEn: '2026-11-22T15:00:00.000Z',
    ...extra,
  };
}

function detalle(extra: Partial<ContactoRedDetalle> = {}): ContactoRedDetalle {
  const c = contacto();
  return { ...c, interacciones: c.ultimaInteraccion ? [c.ultimaInteraccion] : [], ...extra };
}

function lista(items: ContactoRed[], porResponder = 1): ListaDeRed {
  return {
    items,
    resumen: {
      total: items.length,
      conectados: items.length,
      porResponder,
      esperando: 0,
      solicitudesEnviadas: 0,
      seguimientosVencidos: 0,
    },
  };
}

describe('RedStore', () => {
  let api: {
    red: ReturnType<typeof vi.fn>;
    registrarContactoRed: ReturnType<typeof vi.fn>;
  };
  let store: RedStore;

  beforeEach(async () => {
    api = {
      red: vi.fn(() => of(lista([contacto(), contacto({ id: 'c2', pendiente: 'esperando' })]))),
      registrarContactoRed: vi.fn(() => of({ ...detalle({ id: 'c3' }), nuevo: true })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    store = TestBed.inject(RedStore);
    await store.cargar();
  });

  it('carga la lista y cuenta a quién le debes respuesta (contador de la barra lateral)', () => {
    expect(store.estado()).toBe('listo');
    expect(store.items()).toHaveLength(2);
    expect(store.porResponder()).toBe(1);
    expect(store.vacia()).toBe(false);
    expect(api.red).toHaveBeenCalledWith({ filtro: 'todos', texto: '' });
  });

  it('filtrar y buscar mandan el filtro y el texto a la API', async () => {
    await store.filtrar('responder');
    expect(api.red).toHaveBeenLastCalledWith({ filtro: 'responder', texto: '' });
    await store.buscar('  camila ');
    expect(api.red).toHaveBeenLastCalledWith({ filtro: 'responder', texto: 'camila' });
  });

  it('una respuesta vieja no pisa a una más nueva', async () => {
    let soltar!: (v: ListaDeRed) => void;
    api.red.mockReturnValueOnce(
      new Observable<ListaDeRed>((s) => {
        soltar = (v) => {
          s.next(v);
          s.complete();
        };
      }),
    );
    const lenta = store.buscar('a');
    api.red.mockReturnValueOnce(of(lista([contacto({ id: 'nuevo' })], 0)));
    await store.buscar('ab');
    soltar(lista([contacto({ id: 'viejo' })]));
    await lenta;
    expect(store.items().map((c) => c.id)).toEqual(['nuevo']);
  });

  it('registrar crea el contacto y vuelve a pedir la lista', async () => {
    const r = await store.registrar({
      nombre: 'Pablo',
      perfilUrl: 'linkedin.com/in/pablo-ficticio',
      postulacionId: 'p1',
    });
    expect(r).toMatchObject({ ok: true, valor: { id: 'c3', nuevo: true } });
    expect(api.registrarContactoRed).toHaveBeenCalledWith({
      nombre: 'Pablo',
      perfilUrl: 'linkedin.com/in/pablo-ficticio',
      postulacionId: 'p1',
    });
    expect(api.red).toHaveBeenCalledTimes(2);
  });

  it('si la API rechaza el perfil, vuelve el error sin tocar la lista', async () => {
    api.registrarContactoRed.mockReturnValue(
      throwError(() => new ErrorDeApi('VALIDACION', 'perfil', 400, 'perfilUrl')),
    );
    const r = await store.registrar({ nombre: 'X', perfilUrl: 'https://ejemplo.test' });
    expect(r).toMatchObject({ ok: false, error: { codigo: 'VALIDACION', campo: 'perfilUrl' } });
    expect(store.items()).toHaveLength(2);
  });

  it('sin núcleo queda en error; una recarga silenciosa no borra la lista', async () => {
    api.red.mockReturnValue(throwError(() => new ErrorDeApi('RED', 'sin red', 0)));
    await store.cargar(true);
    expect(store.estado()).toBe('listo');
    expect(store.items()).toHaveLength(2);
    await store.cargar();
    expect(store.estado()).toBe('error');
    expect(store.error()?.codigo).toBe('RED');
  });
});

describe('ContactoStore', () => {
  let api: {
    red: ReturnType<typeof vi.fn>;
    verContactoRed: ReturnType<typeof vi.fn>;
    editarContactoRed: ReturnType<typeof vi.fn>;
    registrarInteraccionRed: ReturnType<typeof vi.fn>;
  };
  let store: ContactoStore;
  let red: RedStore;

  beforeEach(async () => {
    api = {
      red: vi.fn(() => of(lista([contacto()]))),
      verContactoRed: vi.fn(() => of(detalle())),
      editarContactoRed: vi.fn((_id: string, c: { vincular?: string; notas?: string | null }) =>
        of(
          detalle({
            postulacionIds: c.vincular ? [c.vincular] : [],
            notas: c.notas ?? null,
          }),
        ),
      ),
      registrarInteraccionRed: vi.fn(() =>
        of({ ...detalle({ pendiente: 'esperando' }), agregada: true }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: api }, ContactoStore],
    });
    store = TestBed.inject(ContactoStore);
    red = TestBed.inject(RedStore);
    await red.cargar();
    await store.cargar('c1');
  });

  it('carga el detalle con su conversación', () => {
    expect(store.estado()).toBe('listo');
    expect(store.detalle()?.interacciones).toHaveLength(1);
  });

  it('vincular manda la postulación y pone al día la lista de la red', async () => {
    const r = await store.vincular('p1');
    expect(r.ok).toBe(true);
    expect(api.editarContactoRed).toHaveBeenCalledWith('c1', { vincular: 'p1' });
    expect(store.detalle()?.postulacionIds).toEqual(['p1']);
    await vi.waitFor(() => expect(api.red).toHaveBeenCalledTimes(2));
  });

  it('desvincular y editar notas usan el mismo PATCH', async () => {
    await store.desvincular('p1');
    expect(api.editarContactoRed).toHaveBeenCalledWith('c1', { desvincular: 'p1' });
    await store.editar({ notas: 'Conocida de la U', seguimiento: '2026-12-01' });
    expect(api.editarContactoRed).toHaveBeenLastCalledWith('c1', {
      notas: 'Conocida de la U',
      seguimiento: '2026-12-01',
    });
    expect(store.detalle()?.notas).toBe('Conocida de la U');
  });

  it('registrar una interacción dice si se agregó o ya estaba', async () => {
    const r = await store.interaccion({ tipo: 'mensaje_enviado', resumen: 'Gracias, el jueves' });
    expect(r).toMatchObject({ ok: true, agregada: true });
    expect(store.detalle()?.pendiente).toBe('esperando');
    api.registrarInteraccionRed.mockReturnValue(of({ ...detalle(), agregada: false }));
    const otra = await store.interaccion({
      tipo: 'mensaje_enviado',
      resumen: 'Gracias, el jueves',
    });
    expect(otra).toMatchObject({ ok: true, agregada: false });
  });

  it('un error de la API vuelve sin cambiar el detalle', async () => {
    api.editarContactoRed.mockReturnValue(
      throwError(() => new ErrorDeApi('NO_ENCONTRADO', 'no', 404)),
    );
    const r = await store.vincular('nada');
    expect(r).toMatchObject({ ok: false, error: { codigo: 'NO_ENCONTRADO' } });
    expect(store.detalle()?.postulacionIds).toEqual([]);
    expect(store.ocupado()).toBe(false);
  });

  it('un contacto que no existe deja la pantalla en error', async () => {
    api.verContactoRed.mockReturnValue(throwError(() => new ErrorDeApi('NO_ENCONTRADO', 'x', 404)));
    await store.cargar('nada');
    expect(store.estado()).toBe('error');
    expect(store.error()?.codigo).toBe('NO_ENCONTRADO');
  });
});

describe('momentoDe', () => {
  const ahora = new Date(2026, 10, 23, 22, 30);

  it('hoy es ahora (no puede quedar en el futuro)', () => {
    expect(momentoDe('2026-11-23', ahora)).toBe(ahora.toISOString());
  });

  it('otro día es su mediodía local', () => {
    expect(momentoDe('2026-11-20', ahora)).toBe(new Date(2026, 10, 20, 12).toISOString());
  });

  it('una fecha futura se queda en ahora y una mal escrita no manda nada', () => {
    expect(momentoDe('2026-12-01', ahora)).toBe(ahora.toISOString());
    expect(momentoDe('20-11-2026', ahora)).toBeUndefined();
  });
});
