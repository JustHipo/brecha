import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from '../../compartido/infraestructura/app-de-pruebas.prueba';
import { prismaDePrueba, vaciar } from '../../compartido/infraestructura/base-de-pruebas.prueba';

const prisma = prismaDePrueba();
let t: AppDePrueba;
let http: ReturnType<typeof request>;
let token: string;
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  t = await appDePrueba();
  http = request(t.app.getHttpServer());
  token = t.token('consola');
});
beforeEach(() => vaciar(prisma));
afterAll(async () => {
  await t.app.close();
  await prisma.$disconnect();
});

describe('red de LinkedIn por REST', () => {
  it('registra, agrega interacciones, edita y filtra', async () => {
    const c = await auth(http.post('/api/v1/red'))
      .send({ nombre: 'Ana Ficticia', perfilUrl: 'linkedin.com/in/ana', empresa: 'Ficticia' })
      .expect(201);
    expect(c.body).toMatchObject({ nuevo: true, conexion: 'ninguna', pendiente: null });
    const otra = await auth(http.post('/api/v1/red'))
      .send({ nombre: 'Ana F.', perfilUrl: 'https://www.linkedin.com/in/ana/' })
      .expect(201);
    expect(otra.body).toMatchObject({ id: c.body.id, nuevo: false, nombre: 'Ana F.', empresa: 'Ficticia' });

    const i = await auth(http.post(`/api/v1/red/${c.body.id}/interacciones`))
      .send({ tipo: 'solicitud_enviada', resumen: 'Le mandé solicitud con nota' })
      .expect(201);
    expect(i.body).toMatchObject({ conexion: 'solicitud_enviada', pendiente: 'esperando', agregada: true });
    expect(i.body.interacciones[0].origen).toBe('consola');

    const e = await auth(http.patch(`/api/v1/red/${c.body.id}`))
      .send({ seguimiento: '2026-01-01', notas: 'Reclutadora' })
      .expect(200);
    expect(e.body.seguimientoVencido).toBe(true);

    const l = await auth(http.get('/api/v1/red?filtro=esperando')).expect(200);
    expect(l.body.items).toHaveLength(1);
    expect(l.body.resumen).toMatchObject({
      total: 1,
      esperando: 1,
      solicitudesEnviadas: 1,
      seguimientosVencidos: 1,
    });
    await auth(http.get('/api/v1/red?filtro=raro')).expect(400);
  });

  it('valida el perfil, la postulación ligada y el id', async () => {
    const r = await auth(http.post('/api/v1/red'))
      .send({ nombre: 'X', perfilUrl: 'https://ejemplo.test/x' })
      .expect(400);
    expect(r.body.campo).toBe('perfilUrl');
    await auth(http.post('/api/v1/red'))
      .send({
        nombre: 'X',
        perfilUrl: 'linkedin.com/in/x',
        postulacionId: '01a20b41-c5e7-7557-978f-3d427b0a38c4',
      })
      .expect(404);
    await auth(http.get('/api/v1/red/no-existe')).expect(404);
  });
});
