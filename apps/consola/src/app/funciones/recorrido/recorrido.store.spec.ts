import { TestBed } from '@angular/core/testing';
import { PASOS } from './pasos';
import { CLAVE_RECORRIDO, RecorridoStore, VERSION_RECORRIDO } from './recorrido.store';

describe('RecorridoStore', () => {
  let store: RecorridoStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(RecorridoStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('tiene entre 6 y 8 pasos, cada uno con al menos un ancla e id único', () => {
    expect(PASOS.length).toBeGreaterThanOrEqual(6);
    expect(PASOS.length).toBeLessThanOrEqual(8);
    expect(new Set(PASOS.map((p) => p.id)).size).toBe(PASOS.length);
    for (const p of PASOS) expect(p.anclas.length).toBeGreaterThan(0);
  });

  it('la primera vez arranca solo desde el primer paso', () => {
    expect(store.iniciarSiEsPrimeraVez()).toBe(true);
    expect(store.abierto()).toBe(true);
    expect(store.indice()).toBe(0);
    expect(store.paso().id).toBe('bienvenida');
    expect(store.esPrimero()).toBe(true);
  });

  it('avanza y retrocede sin salirse de los bordes', () => {
    store.iniciar();
    store.atras();
    expect(store.indice()).toBe(0);
    store.siguiente();
    store.siguiente();
    expect(store.indice()).toBe(2);
    store.atras();
    expect(store.indice()).toBe(1);
  });

  it('«Siguiente» en el último paso termina y lo recuerda', () => {
    store.iniciar();
    for (let i = 0; i < store.total - 1; i++) store.siguiente();
    expect(store.esUltimo()).toBe(true);
    store.siguiente();
    expect(store.abierto()).toBe(false);
    expect(localStorage.getItem(CLAVE_RECORRIDO)).toBe(VERSION_RECORRIDO);
    expect(store.iniciarSiEsPrimeraVez()).toBe(false);
  });

  it('saltar también lo recuerda y no vuelve a salir solo', () => {
    store.iniciarSiEsPrimeraVez();
    store.siguiente();
    store.cerrar();
    expect(store.abierto()).toBe(false);
    expect(store.visto()).toBe(true);
    expect(store.iniciarSiEsPrimeraVez()).toBe(false);
  });

  it('si ya se vio, no arranca solo, pero sí a pedido y desde el principio', () => {
    localStorage.setItem(CLAVE_RECORRIDO, VERSION_RECORRIDO);
    expect(store.iniciarSiEsPrimeraVez()).toBe(false);
    expect(store.abierto()).toBe(false);
    store.indice.set(4);
    store.iniciar();
    expect(store.abierto()).toBe(true);
    expect(store.indice()).toBe(0);
  });

  it('una versión anterior guardada hace que vuelva a salir', () => {
    localStorage.setItem(CLAVE_RECORRIDO, '0');
    expect(store.iniciarSiEsPrimeraVez()).toBe(true);
  });

  it('cerrado, siguiente y atrás no hacen nada', () => {
    store.siguiente();
    store.atras();
    expect(store.indice()).toBe(0);
    expect(store.abierto()).toBe(false);
  });

  it('sin localStorage disponible funciona y se recuerda mientras la consola siga abierta', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(store.iniciarSiEsPrimeraVez()).toBe(true);
    store.cerrar();
    expect(store.visto()).toBe(true);
    expect(store.iniciarSiEsPrimeraVez()).toBe(false);
  });
});
