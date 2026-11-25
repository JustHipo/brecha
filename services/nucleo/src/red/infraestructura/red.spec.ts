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

  it('lo que registra el servicio con IA queda con origen correo', async () => {
    const servicio = (r: request.Test) => r.set('Authorization', `Bearer ${t.token('servicio')}`);
    const c = await servicio(http.post('/api/v1/red'))
      .send({ nombre: 'Ana Ficticia', perfilUrl: 'linkedin.com/in/ana', empresa: 'Ficticia' })
      .expect(201);
    const i = await servicio(http.post(`/api/v1/red/${c.body.id}/interacciones`))
      .send({ tipo: 'mensaje_recibido', resumen: 'Te escribió por LinkedIn', referenciaExterna: '<m1>#0' })
      .expect(201);
    expect(i.body).toMatchObject({ pendiente: 'responder', agregada: true });
    expect(i.body.interacciones[0].origen).toBe('correo');
    const otra = await servicio(http.post(`/api/v1/red/${c.body.id}/interacciones`))
      .send({ tipo: 'mensaje_recibido', resumen: 'Otra vez', referenciaExterna: '<m1>#0' })
      .expect(201);
    expect(otra.body.agregada).toBe(false);
  });

  it('el aviso por correo con el perfil público encuentra al contacto guardado con el id interno', async () => {
    const servicio = (r: request.Test) => r.set('Authorization', `Bearer ${t.token('servicio')}`);
    const interno = 'https://www.linkedin.com/in/ACoAAAwkuRkBqT_8Vxgn';
    const c = await auth(http.post('/api/v1/red'))
      .send({ nombre: 'Felipe Lizama', perfilUrl: interno })
      .expect(201);
    // El servicio con IA registra el contacto del aviso con la URL pública y el nombre como lo escribe LinkedIn.
    const r = await servicio(http.post('/api/v1/red'))
      .send({
        nombre: 'Felipe  Lizama',
        perfilUrl: 'https://www.linkedin.com/in/felipe-lizama-24929158',
        titular: 'Senior Tech Recruiter',
      })
      .expect(201);
    expect(r.body).toMatchObject({
      id: c.body.id,
      nuevo: false,
      perfilUrl: interno,
      titular: 'Senior Tech Recruiter',
    });
    expect((await auth(http.get('/api/v1/red')).expect(200)).body.items).toHaveLength(1);

    // Con dos candidatos del mismo nombre no adivina: crea uno nuevo.
    await auth(http.post('/api/v1/red'))
      .send({ nombre: 'Ana Ficticia', perfilUrl: 'https://www.linkedin.com/in/ACoAAAna1' })
      .expect(201);
    await auth(http.post('/api/v1/red'))
      .send({ nombre: 'Ana Ficticia', perfilUrl: 'https://www.linkedin.com/in/ACoAAAna2' })
      .expect(201);
    const ana = await servicio(http.post('/api/v1/red'))
      .send({ nombre: 'Ana Ficticia', perfilUrl: 'https://www.linkedin.com/in/ana-ficticia' })
      .expect(201);
    expect(ana.body.nuevo).toBe(true);
  });
});
