import { describe, expect, it } from 'vitest';
import {
  conPortada,
  fuenteDeFoto,
  LIMITES_DE_FOTOS,
  revisarCupo,
  revisarLlamada,
  sinHuecos,
  tipoDeImagen,
  validarImagen,
} from './foto';

const bytes = (...b: number[]) => Uint8Array.from(b);
const texto = (s: string) => new TextEncoder().encode(s);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const WEBP = Uint8Array.from([...texto('RIFF'), 0x24, 0, 0, 0, ...texto('WEBPVP8 ')]);

describe('tipo de imagen por los primeros bytes (F-D5)', () => {
  it('reconoce jpg, png y webp', () => {
    expect(tipoDeImagen(JPG)).toBe('image/jpeg');
    expect(tipoDeImagen(PNG)).toBe('image/png');
    expect(tipoDeImagen(WEBP)).toBe('image/webp');
  });

  it('no se fía del nombre: una página HTML, un GIF, un RIFF que no es WEBP o algo muy corto no son imágenes', () => {
    expect(tipoDeImagen(texto('<!doctype html><html>'))).toBeNull();
    expect(tipoDeImagen(texto('GIF89a........'))).toBeNull();
    expect(tipoDeImagen(Uint8Array.from([...texto('RIFF'), 0, 0, 0, 0, ...texto('WAVE')]))).toBeNull();
    expect(tipoDeImagen(bytes(0xff, 0xd8))).toBeNull();
    expect(tipoDeImagen(bytes())).toBeNull();
  });

  it('valida tamaño y tipo con mensajes en palabras', () => {
    expect(validarImagen(PNG)).toBe('image/png');
    expect(() => validarImagen(bytes())).toThrow('vacío');
    expect(() => validarImagen(texto('<html>'))).toThrow('No es una imagen jpg, png ni webp');
    const grande = new Uint8Array(LIMITES_DE_FOTOS.bytes + 1);
    grande.set(JPG);
    expect(() => validarImagen(grande)).toThrow('más de 10 MB');
    const justo = new Uint8Array(LIMITES_DE_FOTOS.bytes);
    justo.set(JPG);
    expect(validarImagen(justo)).toBe('image/jpeg');
  });
});

describe('URL o ruta de tu equipo (macOS y Windows)', () => {
  it('URL http y https', () => {
    expect(fuenteDeFoto(' https://http2.mlstatic.com/D_NQ_NP_1-O.webp ')).toEqual({
      tipo: 'url',
      url: 'https://http2.mlstatic.com/D_NQ_NP_1-O.webp',
    });
    expect(fuenteDeFoto('HTTP://img.yapo.cl/a.jpg').tipo).toBe('url');
  });

  it('rutas de macOS, de Windows (que parecen esquema c:), de red y file://', () => {
    expect(fuenteDeFoto('/Users/juan/Fotos/a.jpg')).toEqual({
      tipo: 'archivo',
      ruta: '/Users/juan/Fotos/a.jpg',
    });
    expect(fuenteDeFoto('~/Fotos/a.jpg').tipo).toBe('archivo');
    expect(fuenteDeFoto('C:\\Users\\juan\\a.jpg')).toEqual({
      tipo: 'archivo',
      ruta: 'C:\\Users\\juan\\a.jpg',
    });
    expect(fuenteDeFoto('d:/fotos/a.png').tipo).toBe('archivo');
    expect(fuenteDeFoto('\\\\servidor\\fotos\\a.png').tipo).toBe('archivo');
    expect(fuenteDeFoto('file:///C:/Users/juan/a.jpg').tipo).toBe('archivo');
  });

  it('rechaza otros esquemas, rutas relativas y vacíos', () => {
    expect(() => fuenteDeFoto('ftp://x/a.jpg')).toThrow('ftp:');
    expect(() => fuenteDeFoto('javascript:alert(1)')).toThrow('javascript:');
    expect(() => fuenteDeFoto('data:image/png;base64,AAAA')).toThrow('data:');
    expect(() => fuenteDeFoto('fotos/a.jpg')).toThrow('completa');
    expect(() => fuenteDeFoto('   ')).toThrow('Falta');
    expect(() => fuenteDeFoto(`https://x.cl/${'a'.repeat(4000)}`)).toThrow('larga');
  });
});

describe('orden y portada (F-D2)', () => {
  const fotos = [
    { id: 'a', orden: 0 },
    { id: 'c', orden: 5 },
    { id: 'b', orden: 2 },
  ];

  it('elegir portada la pasa al frente y las demás conservan su orden, sin huecos', () => {
    expect([...conPortada(fotos, 'c')]).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    expect([...conPortada(fotos, 'a')]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    expect(() => conPortada(fotos, 'z')).toThrow('no es de esta propiedad');
  });

  it('sin huecos después de quitar una', () => {
    expect([...sinHuecos(fotos)]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('límites por llamada y por propiedad (F-D6)', () => {
    expect(() => revisarLlamada(0)).toThrow('al menos una');
    expect(() => revisarLlamada(21)).toThrow('Hasta 20');
    expect(() => revisarLlamada(20)).not.toThrow();
    expect(() => revisarCupo(39)).not.toThrow();
    expect(() => revisarCupo(40)).toThrow('ya tiene 40');
  });
});
