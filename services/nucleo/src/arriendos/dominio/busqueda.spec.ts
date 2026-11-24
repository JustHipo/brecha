import { describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { Busqueda, busquedaVacia, calcularCalce, describir, type DatosBusqueda } from './busqueda';
import { Canal, CANALES_INICIALES, dominioNormalizado } from './canal';
import { esCandidata } from './duplicados';
import { datosValidos, type DatosDeLaPropiedad } from './propiedad';

const depto = (extra: Record<string, unknown> = {}): DatosDeLaPropiedad =>
  datosValidos({
    tipo: 'departamento',
    comuna: 'Ñuñoa',
    dormitorios: 2,
    banos: 1,
    m2Utiles: 55,
    precio: { monto: 550000, moneda: 'CLP' },
    gastosComunes: 90000,
    mascotas: true,
    estacionamientos: 0,
    amoblado: false,
    requisitos: { rentaVeces: 3, aval: true },
    ...extra,
  });

function busqueda(reglas: unknown[], persona: Record<string, unknown> = {}): DatosBusqueda {
  const b = Busqueda.reconstituir(busquedaVacia());
  b.cambiar({ reglas, persona, motivo: 'prueba' }, 'consola', depsDePrueba());
  return b.datos();
}

describe('perfil de búsqueda', () => {
  it('parte con renta y aval como reglas duras, sin historial', () => {
    expect(busquedaVacia().reglas.map((r) => [r.criterio, r.dura])).toEqual([
      ['renta_exigida', true],
      ['aval', true],
    ]);
  });

  it('valida cada regla según su criterio y deja las blandas con prioridades seguidas', () => {
    const b = busqueda([
      { criterio: 'tipo', valor: ['departamento'], dura: false, prioridad: 2 },
      { criterio: 'tipo', valor: 'casa', dura: false, prioridad: 1 },
      { criterio: 'presupuesto_total', valor: 650000 },
      { criterio: 'mascota' },
    ]);
    expect(b.reglas.map(describir)).toEqual([
      'P2 · Tipo: departamento',
      'P1 · Tipo: casa',
      'Dura · Arriendo más gastos comunes hasta $650.000',
      'Dura · Acepta mascota: sí',
    ]);
    const mal = Busqueda.reconstituir(busquedaVacia());
    const deps = depsDePrueba();
    expect(() =>
      mal.cambiar({ reglas: [{ criterio: 'tipo', valor: 'castillo' }], motivo: 'x' }, 'ia', deps),
    ).toThrow();
    expect(() =>
      mal.cambiar({ reglas: [{ criterio: 'comuna', valor: [] }], motivo: 'x' }, 'ia', deps),
    ).toThrow(/opción/);
    expect(() => mal.cambiar({ reglas: [], motivo: '' }, 'ia', deps)).toThrow(/motivo/);
  });

  it('cada cambio queda en el historial con su motivo y origen', () => {
    const deps = depsDePrueba();
    const b = Busqueda.reconstituir(busquedaVacia());
    b.cambiar(
      { reglas: [{ criterio: 'tipo', valor: ['departamento'], dura: false }], motivo: 'Empiezo a buscar' },
      'consola',
      deps,
    );
    b.cambiar(
      {
        reglas: [
          { criterio: 'tipo', valor: ['casa'], dura: false, prioridad: 1 },
          { criterio: 'tipo', valor: ['departamento'], dura: false, prioridad: 2 },
        ],
        motivo: 'Pidió casas: casa pasa a P1',
      },
      'ia',
      deps,
    );
    b.cambiar({ persona: { rentaLiquida: 1800000, tieneAval: false }, motivo: 'Mis datos' }, 'consola', deps);
    const d = b.datos();
    expect(d.historial.map((h) => [h.origen, h.motivo])).toEqual([
      ['consola', 'Empiezo a buscar'],
      ['ia', 'Pidió casas: casa pasa a P1'],
      ['consola', 'Mis datos'],
    ]);
    expect(d.historial[1]!.resumen).toEqual(['P1 · Tipo: casa', 'P2 · Tipo: departamento']);
    expect(d.persona).toEqual({ rentaLiquida: 1800000, tieneAval: false });
    expect(d.reglas).toHaveLength(2);
  });
});

describe('calce', () => {
  it('todo duro y cumplido: 100', () => {
    const b = busqueda(
      [
        { criterio: 'presupuesto_total', valor: 700000 },
        { criterio: 'comuna', valor: ['nunoa', 'Providencia'] },
        { criterio: 'dormitorios', valor: 2 },
        { criterio: 'mascota' },
        { criterio: 'renta_exigida' },
        { criterio: 'aval' },
      ],
      { rentaLiquida: 2_000_000, tieneAval: true },
    );
    expect(calcularCalce(depto(), b, null)).toMatchObject({ puntaje: 100, cumpleDuras: true, brechas: [] });
  });

  it('una dura que falla deja 0 y su brecha va primero, en palabras', () => {
    const b = busqueda(
      [
        { criterio: 'tipo', valor: ['casa'], dura: false },
        { criterio: 'presupuesto_total', valor: 600000 },
        { criterio: 'renta_exigida' },
      ],
      { rentaLiquida: 1_430_000 },
    );
    const c = calcularCalce(depto(), b, null);
    expect(c.puntaje).toBe(0);
    expect(c.brechas.map((x) => x.texto)).toEqual([
      'Se pasa $40.000 del presupuesto ($640.000 con gastos comunes)',
      'Pide renta 3x ($1.650.000) y tienes 2,6x',
      'Es departamento, no casa',
    ]);
  });

  it('blandas: P1 pesa el doble que P2', () => {
    const b = busqueda([
      { criterio: 'tipo', valor: ['casa'], dura: false, prioridad: 1 },
      { criterio: 'tipo', valor: ['departamento'], dura: false, prioridad: 2 },
    ]);
    expect(calcularCalce(depto(), b, null).puntaje).toBe(33);
    expect(calcularCalce(depto({ tipo: 'casa' }), b, null).puntaje).toBe(67);
  });

  it('lo que el aviso no dice no cuenta y se avisa', () => {
    const b = busqueda([
      { criterio: 'presupuesto_total', valor: 700000 },
      { criterio: 'estacionamiento', valor: true, dura: false },
    ]);
    const c = calcularCalce(depto({ precio: { monto: 20, moneda: 'UF' }, estacionamientos: null }), b, null);
    expect(c.puntaje).toBeNull();
    expect(c.sinDato.map((s) => s.criterio)).toEqual(['presupuesto_total', 'estacionamiento']);
    // Con la UF del día el precio en UF sí se compara.
    expect(calcularCalce(depto({ precio: { monto: 20, moneda: 'UF' } }), b, 39000).brechas[0]?.texto).toMatch(
      /Se pasa \$170\.000/,
    );
  });

  it('gastos comunes, amoblado, aval y fecha de mudanza', () => {
    const b = busqueda(
      [
        { criterio: 'gastos_comunes', valor: 80000 },
        { criterio: 'amoblado', valor: true },
        { criterio: 'aval' },
        { criterio: 'disponible_desde', valor: '2026-12-01' },
        { criterio: 'banos', valor: 2, dura: false },
        { criterio: 'm2', valor: 50, dura: false },
      ],
      { tieneAval: false },
    );
    const c = calcularCalce(depto({ disponibleDesde: '2027-01-01' }), b, null);
    expect(c.brechas.map((x) => x.criterio)).toEqual([
      'gastos_comunes',
      'amoblado',
      'aval',
      'disponible_desde',
      'banos',
    ]);
  });
});

describe('duplicados', () => {
  it('misma dirección y comuna, o pines a menos de 30 m, con los mismos dormitorios', () => {
    const a = { direccion: 'Av. Irarrázaval 3000 depto 504', comuna: 'Ñuñoa', dormitorios: 2 };
    expect(esCandidata(a, { direccion: 'Avenida Irarrazaval 3000', comuna: 'nunoa', dormitorios: 2 })).toBe(
      true,
    );
    expect(esCandidata(a, { direccion: 'Avenida Irarrazaval 3000', comuna: 'nunoa', dormitorios: 3 })).toBe(
      false,
    );
    const p1 = { ubicacion: { lat: -33.4569, lon: -70.6, origen: 'geocodificada' as const } };
    const p2 = { ubicacion: { lat: -33.457, lon: -70.6001, origen: 'manual' as const } };
    expect(esCandidata(p1, p2)).toBe(true);
    expect(esCandidata(p1, { ubicacion: { ...p2.ubicacion, origen: 'comuna' } })).toBe(false);
  });
});

describe('canales', () => {
  it('vienen los de partida y uno nuevo reconoce sus URLs y correos', () => {
    expect(CANALES_INICIALES.map((c) => c.id)).toContain('portalinmobiliario');
    const c = Canal.crear(
      { nombre: 'Mi Corredora SpA', tipo: 'corredora', dominios: ['https://www.MiCorredora.cl/x'] },
      depsDePrueba(),
    );
    expect(c.datos()).toMatchObject({
      id: 'mi-corredora-spa',
      dominios: ['micorredora.cl'],
      predefinido: false,
    });
    expect(c.reconoce('https://propiedades.micorredora.cl/1')).toBe(true);
    expect(c.reconoce('ana@micorredora.cl')).toBe(true);
    expect(c.reconoce('otra.cl')).toBe(false);
    expect(() => dominioNormalizado('no es dominio')).toThrow();
    c.editar({ activo: false });
    expect(c.datos().activo).toBe(false);
  });
});
