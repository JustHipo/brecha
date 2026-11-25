import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from '../../../compartido/infraestructura/app-de-pruebas.prueba';
import { prismaDePrueba, vaciar } from '../../../compartido/infraestructura/base-de-pruebas.prueba';

const prisma = prismaDePrueba();
let t: AppDePrueba;
let http: ReturnType<typeof request>;
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${t.token('consola')}`);

beforeAll(async () => {
  t = await appDePrueba();
  http = request(t.app.getHttpServer());
});
beforeEach(() => vaciar(prisma));
afterAll(async () => {
  await t.app.close();
  await prisma.$disconnect();
});

const SANTIAGO = {
  valparaiso: ['presencial', 'hibrido', 'remoto'],
  santiago: ['hibrido', 'remoto'],
  otra: ['remoto'],
  noIndicaEsPresencialEn: ['trabajando'],
};

async function crear(aviso: Record<string, unknown>) {
  const r = await auth(http.post('/api/v1/postulaciones'))
    .send({
      aviso: {
        titulo: 'Desarrollador Backend',
        empresa: 'Empresa Ficticia',
        url: `https://ejemplo.test/avisos/${Math.random()}`,
        plataforma: 'linkedin',
        modalidad: 'hibrido',
        ubicacion: 'Santiago',
        ...aviso,
      },
    })
    .expect(201);
  return r.body.id as string;
}

describe('perfil de búsqueda de Empleo por REST', () => {
  it('parte vacío; se agregan reglas con etiquetas y datos, y el historial guarda el motivo', async () => {
    const vacio = await auth(http.get('/api/v1/perfil')).expect(200);
    expect(vacio.body).toMatchObject({ reglas: [], datos: {}, historial: [], actualizadaEn: null });
    expect(vacio.body.criterios).toEqual(['titulo', 'modalidad_por_region', 'sueldo_publicado']);

    const r = await auth(http.put('/api/v1/perfil'))
      .send({
        agregar: [
          {
            texto: 'Santiago solo híbrido o remoto',
            criterio: 'modalidad_por_region',
            valor: SANTIAGO,
            etiquetas: ['Ubicación'],
          },
          { texto: 'Nada de liderazgo que pida 4 años o más', etiquetas: ['rol'] },
          { criterio: 'sueldo_publicado', dura: false },
        ],
        datos: { rentaPretendida: 1400000, disponibleDesde: '2026-12-31' },
        motivo: 'Perfil inicial',
      })
      .expect(200);
    expect(
      r.body.reglas.map((x: { descripcion: string; porCodigo: boolean }) => [x.descripcion, x.porCodigo]),
    ).toEqual([
      ['Dura · Santiago solo híbrido o remoto #ubicacion', true],
      ['Dura · Nada de liderazgo que pida 4 años o más #rol', false],
      ['P1 · Con sueldo publicado que llegue a tu renta pretendida', true],
    ]);
    expect(r.body.datos).toEqual({ rentaPretendida: 1400000, disponibleDesde: '2026-12-31' });
    expect(r.body.historial[0]).toMatchObject({ motivo: 'Perfil inicial', origen: 'consola' });
    expect(r.body.etiquetas).toEqual([
      { etiqueta: 'rol', total: 1 },
      { etiqueta: 'ubicacion', total: 1 },
    ]);

    await auth(http.put('/api/v1/perfil'))
      .send({ quitar: ['no-existe'], motivo: 'x' })
      .expect(404);
    const sinMotivo = await auth(http.put('/api/v1/perfil'))
      .send({ agregar: [{ texto: 'x' }] })
      .expect(400);
    expect(sinMotivo.body.campo).toBe('motivo');
  });

  it('las postulaciones muestran los choques en tablero, lista y ficha, sin cambiar su estado', async () => {
    const presencial = await crear({ modalidad: 'presencial' });
    const bien = await crear({ sueldoPublicado: '$1.600.000' });

    // Sin perfil con chequeos, no hay nada que mostrar.
    const antes = await auth(http.get(`/api/v1/postulaciones/${presencial}`)).expect(200);
    expect(antes.body.perfil).toBeNull();

    await auth(http.put('/api/v1/perfil'))
      .send({
        agregar: [
          { texto: 'Santiago solo híbrido o remoto', criterio: 'modalidad_por_region', valor: SANTIAGO },
          { criterio: 'sueldo_publicado', valor: { minimo: 1400000 }, dura: false },
        ],
        motivo: 'Perfil inicial',
      })
      .expect(200);

    const ficha = await auth(http.get(`/api/v1/postulaciones/${presencial}`)).expect(200);
    expect(ficha.body.estado).toBe('sin_decidir');
    expect(ficha.body.perfil).toMatchObject({
      cumpleDuras: false,
      choques: [
        { dura: true, texto: 'Presencial en Santiago; ahí solo aceptas híbrido, remoto' },
        { dura: false, prioridad: 1, texto: 'No publica sueldo' },
      ],
    });

    const lista = await auth(http.get('/api/v1/postulaciones')).expect(200);
    const porId = Object.fromEntries(
      lista.body.items.map((x: { id: string; perfil: { cumpleDuras: boolean } }) => [
        x.id,
        x.perfil.cumpleDuras,
      ]),
    );
    expect(porId).toEqual({ [presencial]: false, [bien]: true });

    const tablero = await auth(http.get('/api/v1/postulaciones/tablero')).expect(200);
    const tarjetas = tablero.body.columnas.flatMap(
      (c: { items: { id: string; perfil: unknown }[] }) => c.items,
    );
    expect(tarjetas.find((x: { id: string }) => x.id === bien).perfil).toEqual({
      cumpleDuras: true,
      choques: [],
      sinDato: [],
    });
  });
});
