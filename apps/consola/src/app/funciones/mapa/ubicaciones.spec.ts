import { agrupar, Ubicador, type Comuna } from './ubicaciones';

const COMUNAS: Comuna[] = [
  { n: 'Santiago', lat: -33.45, lon: -70.66 },
  { n: 'Las Condes', lat: -33.41, lon: -70.56 },
  { n: 'Ñuñoa', lat: -33.46, lon: -70.6 },
  { n: 'Valparaíso', lat: -33.05, lon: -71.6 },
];
const u = new Ubicador(COMUNAS);

describe('ubicación de un aviso de empleo', () => {
  it('la primera parte que es comuna gana, sin tildes ni mayúsculas', () => {
    expect(u.lugar('Las Condes, Santiago')).toMatchObject({ comuna: { n: 'Las Condes' } });
    expect(u.lugar('NUNOA')).toMatchObject({ comuna: { n: 'Ñuñoa' } });
    expect(u.lugar('Híbrido · Ñuñoa')).toMatchObject({ comuna: { n: 'Ñuñoa' } });
    expect(u.lugar('Santiago, Chile')).toMatchObject({ comuna: { n: 'Santiago' } });
  });

  it('una región o un sinónimo va a su capital', () => {
    expect(u.lugar('Región Metropolitana')).toMatchObject({ comuna: { n: 'Santiago' } });
    expect(u.lugar('Gran Valparaíso')).toMatchObject({ comuna: { n: 'Valparaíso' } });
  });

  it('remoto no tiene pin; lo que no se reconoce queda sin ubicar', () => {
    expect(u.lugar('Remoto')).toEqual({ tipo: 'remoto' });
    expect(u.lugar('', 'remoto')).toEqual({ tipo: 'remoto' });
    expect(u.lugar('Chile')).toEqual({ tipo: 'sin_ubicar' });
    expect(u.lugar(null)).toEqual({ tipo: 'sin_ubicar' });
  });

  it('junta por comuna de la más llena a la menos', () => {
    const r = agrupar(['Ñuñoa', 'Las Condes', 'nunoa', 'Remoto', 'Marte'], (x) => u.lugar(x));
    expect(r.grupos.map((g) => [g.comuna.n, g.items.length])).toEqual([
      ['Ñuñoa', 2],
      ['Las Condes', 1],
    ]);
    expect(r.remotos).toEqual(['Remoto']);
    expect(r.sinUbicar).toEqual(['Marte']);
  });
});
