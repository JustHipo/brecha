import { MARGEN, SEPARACION, calcularPosicion } from './posicion';

const vista = { width: 1280, height: 860 };
const popup = { width: 340, height: 220 };

describe('calcularPosicion', () => {
  it('sin ancla va al centro de la ventana', () => {
    const p = calcularPosicion(null, popup, vista);
    expect(p).toEqual({ top: 320, left: 470, lado: 'centro', flecha: null });
  });

  it('un enlace de la barra lateral lleva el popup a su derecha, con la flecha a su altura', () => {
    const p = calcularPosicion({ top: 400, left: 10, width: 216, height: 34 }, popup, vista);
    expect(p.lado).toBe('derecha');
    expect(p.left).toBe(226 + SEPARACION);
    expect(p.top).toBe(417 - 110);
    expect(p.flecha).toBe(110);
  });

  it('cerca del borde inferior el popup no se sale y la flecha sigue apuntando al ancla', () => {
    const p = calcularPosicion({ top: 800, left: 10, width: 216, height: 34 }, popup, vista);
    expect(p.top).toBe(vista.height - popup.height - MARGEN);
    expect(p.flecha).toBe(817 - p.top);
  });

  it('un botón a la derecha de la pantalla lo lleva abajo', () => {
    const p = calcularPosicion({ top: 70, left: 1100, width: 160, height: 36 }, popup, vista);
    expect(p.lado).toBe('abajo');
    expect(p.top).toBe(106 + SEPARACION);
    expect(p.left).toBe(vista.width - popup.width - MARGEN);
  });

  it('un ancla abajo a la derecha lo lleva arriba', () => {
    const p = calcularPosicion({ top: 760, left: 1100, width: 160, height: 60 }, popup, vista);
    expect(p.lado).toBe('arriba');
    expect(p.top).toBe(760 - SEPARACION - popup.height);
  });

  it('un ancla que ocupa casi toda la ventana deja el popup dentro, sin flecha', () => {
    const p = calcularPosicion({ top: 150, left: 20, width: 1240, height: 700 }, popup, vista);
    expect(p.lado).toBe('dentro');
    expect(p.flecha).toBeNull();
    expect(p.top).toBe(174);
  });
});
