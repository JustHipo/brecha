import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { ApiArriendos } from '../../nucleo/api/arriendos.api';
import { ImagenesDeFotos } from './fotos';

describe('ImagenesDeFotos (fotos con token, F-D12)', () => {
  let api: { imagen: ReturnType<typeof vi.fn> };
  let imagenes: ImagenesDeFotos;
  const crear = vi.fn((b: Blob) => `blob:prueba/${b.size}`);
  const soltar = vi.fn();

  beforeEach(() => {
    crear.mockClear();
    soltar.mockClear();
    URL.createObjectURL = crear as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = soltar;
    api = { imagen: vi.fn(() => of(new Blob([new Uint8Array(3)]))) };
    TestBed.configureTestingModule({ providers: [{ provide: ApiArriendos, useValue: api }] });
    imagenes = TestBed.inject(ImagenesDeFotos);
  });

  it('pide cada foto una sola vez y la entrega como blob:', () => {
    const a = imagenes.url('f1');
    const b = imagenes.url('f1');
    expect(a).toBe(b);
    expect(api.imagen).toHaveBeenCalledTimes(1);
    expect(a()).toBe('blob:prueba/3');
  });

  it('mientras llega es null', () => {
    const pendiente = new Subject<Blob>();
    api.imagen.mockReturnValueOnce(pendiente);
    const u = imagenes.url('f2');
    expect(u()).toBeNull();
    pendiente.next(new Blob([new Uint8Array(5)]));
    expect(u()).toBe('blob:prueba/5');
  });

  it('si falla dice error y la próxima vez lo vuelve a intentar', () => {
    api.imagen.mockReturnValueOnce(throwError(() => new Error('404')));
    expect(imagenes.url('f3')()).toBe('error');
    expect(imagenes.url('f3')()).toBe('blob:prueba/3');
    expect(api.imagen).toHaveBeenCalledTimes(2);
  });

  it('olvidar suelta el blob: de una foto quitada', () => {
    imagenes.url('f4');
    imagenes.olvidar('f4');
    expect(soltar).toHaveBeenCalledWith('blob:prueba/3');
    imagenes.url('f4');
    expect(api.imagen).toHaveBeenCalledTimes(2);
  });
});
