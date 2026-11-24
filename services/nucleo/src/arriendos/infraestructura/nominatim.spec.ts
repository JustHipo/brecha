import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { prismaDePrueba, vaciar } from '../../compartido/infraestructura/base-de-pruebas.prueba';
import { CasosDeArriendos } from '../aplicacion/casos';
import { AGENTE, consultaDe, GeocodificadorNominatim } from './nominatim';
import {
  PrismaAjustesArriendos,
  PrismaBandejaArriendos,
  PrismaBusqueda,
  PrismaCanales,
  PrismaPropiedades,
} from './prisma-arriendos';

const prisma = prismaDePrueba();
beforeEach(() => vaciar(prisma));
afterAll(() => prisma.$disconnect());

/** Respuesta grabada de Nominatim (formato jsonv2), sin salir a internet. */
function falso(respuestas: unknown[]) {
  const pedidos: { url: string; init: RequestInit }[] = [];
  const buscar = async (url: string, init: RequestInit) => {
    pedidos.push({ url, init });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return { ok: r !== 'error', json: async () => r };
  };
  return { pedidos, buscar };
}

describe('geocodificador Nominatim', () => {
  it('se identifica, guarda el resultado y no vuelve a preguntar', async () => {
    const f = falso([[{ lat: '-33.4569', lon: '-70.5975' }]]);
    const esperas: number[] = [];
    const g = new GeocodificadorNominatim(
      prisma,
      async () => true,
      f.buscar,
      'https://n.test',
      async (ms) => {
        esperas.push(ms);
      },
    );
    expect(await g.ubicar('Av. Irarrázaval 3000', 'Ñuñoa')).toEqual({ lat: -33.4569, lon: -70.5975 });
    expect(await g.ubicar('Av.  Irarrázaval 3000', 'Ñuñoa')).toEqual({ lat: -33.4569, lon: -70.5975 });
    expect(f.pedidos).toHaveLength(1);
    expect(f.pedidos[0]!.url).toContain('countrycodes=cl');
    expect(f.pedidos[0]!.url).toContain(
      encodeURIComponent('av. irarrázaval 3000, ñuñoa, chile').replace(/%20/g, '+'),
    );
    expect((f.pedidos[0]!.init.headers as Record<string, string>)['User-Agent']).toBe(AGENTE);
  });

  it('espera un segundo entre pedidos, guarda lo que no encontró y no guarda un error de red', async () => {
    const f = falso([[], new Error('sin red'), [{ lat: '-33.4', lon: '-70.6' }]]);
    const esperas: number[] = [];
    const g = new GeocodificadorNominatim(
      prisma,
      async () => true,
      f.buscar,
      'https://n.test',
      async (ms) => {
        esperas.push(ms);
      },
    );
    const [a, b] = await Promise.all([g.ubicar('Calle Inventada 1'), g.ubicar('Otra 2')]);
    expect([a, b]).toEqual([null, null]);
    expect(esperas.length).toBe(1);
    expect(
      await prisma.geocodificacion.findUnique({ where: { consulta: consultaDe('Calle Inventada 1') } }),
    ).toMatchObject({
      lat: null,
    });
    expect(await g.ubicar('Otra 2')).toEqual({ lat: -33.4, lon: -70.6 });
  });

  it('apagado no sale de tu equipo', async () => {
    const f = falso([]);
    const g = new GeocodificadorNominatim(prisma, async () => false, f.buscar);
    expect(await g.ubicar('Los Leones 1200', 'Providencia')).toBeNull();
    expect(f.pedidos).toHaveLength(0);
  });
});

describe('ubicar propiedades', () => {
  it('la dirección da el pin; si no la encuentra, el centro de la comuna marcado como aproximado', async () => {
    const deps = depsDePrueba();
    const f = falso([[], [{ lat: '-33.42', lon: '-70.61' }]]);
    const casos = new CasosDeArriendos({
      propiedades: new PrismaPropiedades(prisma),
      canales: new PrismaCanales(prisma),
      busqueda: new PrismaBusqueda(prisma),
      bandeja: new PrismaBandejaArriendos(prisma),
      ajustes: new PrismaAjustesArriendos(prisma),
      geocodificador: new GeocodificadorNominatim(
        prisma,
        async () => true,
        f.buscar,
        'https://n.test',
        async () => {},
      ),
      reloj: deps.reloj,
      ids: deps.ids,
    });
    const r = await casos.crear({ direccion: 'Calle Que No Existe 99', comuna: 'Providencia' }, 'consola');
    // La geocodificación corre en segundo plano: se espera a que termine.
    await new Promise((res) => setTimeout(res, 50));
    for (let i = 0; i < 20 && !(await casos.ver(r.propiedad.id)).ubicacion; i++)
      await new Promise((res) => setTimeout(res, 25));
    expect((await casos.ver(r.propiedad.id)).ubicacion).toEqual({
      lat: -33.42,
      lon: -70.61,
      origen: 'comuna',
    });
    expect((await casos.verBusqueda()).geocodificar).toBe(true);
    await casos.fijarGeocodificar(false);
    expect((await casos.verBusqueda()).geocodificar).toBe(false);
  });
});
