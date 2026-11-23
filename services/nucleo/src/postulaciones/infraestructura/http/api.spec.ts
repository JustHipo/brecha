import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from '../../../compartido/infraestructura/app-de-pruebas.prueba';
import { prismaDePrueba, vaciar } from '../../../compartido/infraestructura/base-de-pruebas.prueba';
import { AccesoService } from '../../../acceso/acceso.service';

const prisma = prismaDePrueba();
let t: AppDePrueba;
let http: ReturnType<typeof request>;
let token: string;

const AVISO = {
  titulo: 'Backend NestJS',
  empresa: 'Empresa Ficticia',
  url: 'https://ejemplo.test/avisos/1',
  plataforma: 'getonboard',
  modalidad: 'remoto',
  ubicacion: 'Chile',
};
const CANAL = { tipo: 'portal', valor: 'Get on Board' };
const hoy = new Date().toISOString().slice(0, 10);

const api = () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (u: string) => auth(http.get(`/api/v1${u}`)),
    post: (u: string, b?: object) => auth(http.post(`/api/v1${u}`)).send(b ?? {}),
    patch: (u: string, b: object) => auth(http.patch(`/api/v1${u}`)).send(b),
  };
};

async function crear(extra: object = {}) {
  const r = await api()
    .post('/postulaciones', { aviso: AVISO, ...extra })
    .expect(201);
  return r.body as { id: string; version: number };
}

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

describe('acceso (F1-09) y seguridad (ADR 0019)', () => {
  it('sin token da 401 NO_AUTENTICADO', async () => {
    const r = await http.get('/api/v1/postulaciones').expect(401);
    expect(r.body).toEqual({ codigo: 'NO_AUTENTICADO', mensaje: 'Hace falta un token válido' });
  });

  it('un token inventado da 401', async () => {
    await http.get('/api/v1/postulaciones').set('Authorization', 'Bearer inventado').expect(401);
  });

  it('un Host ajeno se rechaza (DNS rebinding)', async () => {
    const r = await api().get('/postulaciones').set('Host', 'atacante.test').expect(401);
    expect(r.body.mensaje).toBe('Host no permitido');
  });

  it('un Origin que no es la consola se rechaza, también en rutas públicas', async () => {
    await api().get('/postulaciones').set('Origin', 'https://otro.test').expect(401);
    await http.get('/api/v1/acceso/estado').set('Origin', 'https://otro.test').expect(401);
    await api().get('/postulaciones').set('Origin', 'http://localhost:4200').expect(200);
  });

  it('el token de MCP no sirve fuera de lo permitido y el de consola no sirve en /mcp', async () => {
    await http.post('/mcp').set('Authorization', `Bearer ${token}`).send({}).expect(401);
  });

  it('GET /acceso/estado sin clave', async () => {
    const r = await http.get('/api/v1/acceso/estado').expect(200);
    expect(r.body).toEqual({ claveConfigurada: false, desbloqueado: false });
    const r2 = await api().get('/acceso/estado').expect(200);
    expect(r2.body.desbloqueado).toBe(true);
  });

  it('con clave: el token de consola deja de servir, una clave mala da CLAVE_INVALIDA y la buena da un token', async () => {
    const acceso = t.app.get(AccesoService);
    await acceso.fijarClave('clave-de-prueba');
    try {
      await api().get('/postulaciones').expect(401);
      const mala = await http.post('/api/v1/acceso/desbloquear').send({ clave: 'otra' }).expect(401);
      expect(mala.body).toMatchObject({ codigo: 'CLAVE_INVALIDA', campo: 'clave' });
      const buena = await http
        .post('/api/v1/acceso/desbloquear')
        .send({ clave: 'clave-de-prueba' })
        .expect(200);
      expect(buena.body.token).toHaveLength(43);
      await http.get('/api/v1/postulaciones').set('Authorization', `Bearer ${buena.body.token}`).expect(200);
      const estado = await http.get('/api/v1/acceso/estado').expect(200);
      expect(estado.body.claveConfigurada).toBe(true);
    } finally {
      await acceso.fijarClave(null);
      token = t.token('consola');
    }
  });

  it('desbloquear sin clave configurada da VALIDACION', async () => {
    await http.post('/api/v1/acceso/desbloquear').send({ clave: 'x' }).expect(400);
  });

  it('salud responde sin token', async () => {
    await http.get('/api/v1/salud').expect(200, { ok: true });
  });
});

describe('rutas de postulaciones (F1-10b)', () => {
  it('POST /postulaciones crea; con el mismo aviso da YA_EXISTE con el id existente', async () => {
    const p = await crear();
    const r = await api().post('/postulaciones', { aviso: AVISO }).expect(409);
    expect(r.body).toMatchObject({ codigo: 'YA_EXISTE', campo: 'aviso.url', existenteId: p.id });
  });

  it('POST /postulaciones valida la forma y los campos desconocidos', async () => {
    const r = await api()
      .post('/postulaciones', { aviso: { ...AVISO, url: 'no es url' } })
      .expect(400);
    expect(r.body).toMatchObject({ codigo: 'VALIDACION', campo: 'aviso.url' });
    const r2 = await api().post('/postulaciones', { aviso: AVISO, inventado: 1 }).expect(400);
    expect(r2.body).toMatchObject({ codigo: 'VALIDACION', campo: 'inventado' });
    const r3 = await api()
      .post('/postulaciones', { aviso: { ...AVISO, plataforma: 'myspace' } })
      .expect(400);
    expect(r3.body.campo).toBe('aviso.plataforma');
  });

  it('GET /postulaciones lista y un filtro desconocido es VALIDACION', async () => {
    await crear();
    const r = await api().get('/postulaciones?estado=sin_decidir&prioridad=media&limit=10').expect(200);
    expect(r.body).toMatchObject({ total: 1, limit: 10, offset: 0 });
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await crear({ aviso: { ...AVISO, url: 'https://ejemplo.test/pronto', cierre: manana } });
    const altas = await api().get('/postulaciones?prioridad=alta').expect(200);
    expect(altas.body.items.map((i: { cierre: string }) => i.cierre)).toEqual([manana]);
    await api().get('/postulaciones?estado=inventado').expect(400);
    const r2 = await api().get('/postulaciones?color=rojo').expect(400);
    expect(r2.body.campo).toBe('color');
  });

  it('GET /postulaciones/tablero devuelve las 9 columnas', async () => {
    await crear();
    const r = await api().get('/postulaciones/tablero').expect(200);
    expect(r.body.columnas).toHaveLength(9);
    expect(r.body.columnas[0]).toMatchObject({ estado: 'sin_decidir', total: 1 });
  });

  it('GET /postulaciones/:id detalle y NO_ENCONTRADO', async () => {
    const p = await crear();
    const r = await api().get(`/postulaciones/${p.id}`).expect(200);
    expect(r.body).toMatchObject({
      id: p.id,
      transicionesPosibles: ['por_postular', 'postulado', 'descartado'],
    });
    await api().get('/postulaciones/00000000-0000-7000-8000-000000000000').expect(404);
    await api().get('/postulaciones/no-es-un-id').expect(404);
  });

  it('PATCH /postulaciones/:id edita y da CONFLICTO con una versión vieja', async () => {
    const p = await crear();
    const r = await api()
      .patch(`/postulaciones/${p.id}`, { version: 0, cierre: '2026-12-31', canal: CANAL })
      .expect(200);
    expect(r.body).toMatchObject({ cierre: '2026-12-31', version: 1 });
    const c = await api().patch(`/postulaciones/${p.id}`, { version: 0, cierre: null }).expect(409);
    expect(c.body.codigo).toBe('CONFLICTO');
  });

  it('POST /transiciones mueve y da TRANSICION_INVALIDA en un salto no permitido', async () => {
    const p = await crear();
    const mala = await api()
      .post(`/postulaciones/${p.id}/transiciones`, { a: 'entrevista', origen: 'tablero', version: 0 })
      .expect(422);
    expect(mala.body).toMatchObject({ codigo: 'TRANSICION_INVALIDA', campo: 'a' });
    const sinDatos = await api()
      .post(`/postulaciones/${p.id}/transiciones`, { a: 'postulado', version: 0 })
      .expect(400);
    expect(sinDatos.body.campo).toBe('fechaPostulacion');
    const r = await api()
      .post(`/postulaciones/${p.id}/transiciones`, {
        a: 'postulado',
        fechaPostulacion: hoy,
        canal: CANAL,
        origen: 'tablero',
        version: 0,
      })
      .expect(200);
    expect(r.body).toMatchObject({
      estado: 'postulado',
      prioridad: 'alta',
      historial: [{ origen: 'tablero' }, { origen: 'formulario' }],
    });
  });

  it('POST /transiciones con el aviso cerrado da AVISO_CERRADO', async () => {
    const p = await crear({ aviso: { ...AVISO, cierre: '2020-01-01' } });
    const r = await api()
      .post(`/postulaciones/${p.id}/transiciones`, {
        a: 'postulado',
        fechaPostulacion: hoy,
        canal: CANAL,
        version: 0,
      })
      .expect(422);
    expect(r.body.codigo).toBe('AVISO_CERRADO');
  });

  it('POST /notas agrega y una nota vacía es VALIDACION', async () => {
    const p = await crear();
    const r = await api().post(`/postulaciones/${p.id}/notas`, { texto: 'Hola' }).expect(201);
    expect(r.body.notas).toHaveLength(1);
    await api().post(`/postulaciones/${p.id}/notas`, { texto: '' }).expect(400);
  });

  it('POST /contactos agrega y en estado terminal da ESTADO_TERMINAL', async () => {
    const p = await crear({ estado: 'postulado', fechaPostulacion: hoy, canal: CANAL });
    await api()
      .post(`/postulaciones/${p.id}/contactos`, { nombre: 'Persona', email: 'p@ejemplo.test' })
      .expect(201);
    const d = await api().get(`/postulaciones/${p.id}`);
    await api()
      .post(`/postulaciones/${p.id}/transiciones`, {
        a: 'rechazado',
        motivo: 'No siguieron',
        version: d.body.version,
      })
      .expect(200);
    const r = await api()
      .post(`/postulaciones/${p.id}/contactos`, { nombre: 'Otra', email: 'o@ejemplo.test' })
      .expect(422);
    expect(r.body.codigo).toBe('ESTADO_TERMINAL');
  });

  it('POST /entrevistas agenda (mueve a entrevista) y PATCH registra el resultado; desde sin_decidir falla', async () => {
    const p = await crear({ estado: 'postulado', fechaPostulacion: hoy, canal: CANAL });
    const r = await api()
      .post(`/postulaciones/${p.id}/entrevistas`, { fecha: '2026-12-01T15:00:00Z', tipo: 'tecnica' })
      .expect(201);
    expect(r.body.estado).toBe('entrevista');
    const eid = r.body.entrevistas[0].id;
    const r2 = await api()
      .patch(`/postulaciones/${p.id}/entrevistas/${eid}`, { resultado: 'avanza' })
      .expect(200);
    expect(r2.body.entrevistas[0].resultado).toBe('avanza');
    await api().patch(`/postulaciones/${p.id}/entrevistas/no-existe`, { resultado: 'avanza' }).expect(404);
    const otra = await crear({ aviso: { ...AVISO, url: 'https://ejemplo.test/2' } });
    await api()
      .post(`/postulaciones/${otra.id}/entrevistas`, { fecha: '2026-12-01T15:00:00Z', tipo: 'rrhh' })
      .expect(422);
  });

  it('POST /senales registra, abre la discrepancia y una referencia repetida da YA_EXISTE', async () => {
    const p = await crear();
    await api()
      .post(`/postulaciones/${p.id}/transiciones`, {
        a: 'postulado',
        fechaPostulacion: hoy,
        canal: CANAL,
        version: 0,
      })
      .expect(200);
    const senal = {
      fuente: 'correo',
      resumen: 'No continuaremos',
      estadoSugerido: 'rechazado',
      confianza: 0.92,
      referenciaExterna: '<1@correo>',
    };
    const r = await api().post(`/postulaciones/${p.id}/senales`, senal).expect(201);
    expect(r.body.senal.aplicada).toBe(false);
    expect(r.body.postulacion.discrepanciasAbiertas).toBe(1);
    const dup = await api().post(`/postulaciones/${p.id}/senales`, senal).expect(409);
    expect(dup.body.codigo).toBe('YA_EXISTE');
    await api()
      .post(`/postulaciones/${p.id}/senales`, { ...senal, confianza: 3 })
      .expect(400);
  });

  it('POST /senales/:sid/aplicar aplica y una transición inválida da TRANSICION_INVALIDA', async () => {
    const p = await crear();
    const ok = await api()
      .post(`/postulaciones/${p.id}/senales`, {
        fuente: 'manual',
        resumen: 'Ver',
        estadoSugerido: 'por_postular',
        confianza: 0.6,
      })
      .expect(201);
    const r = await api().post(`/postulaciones/${p.id}/senales/${ok.body.senal.id}/aplicar`).expect(200);
    expect(r.body.estado).toBe('por_postular');
    const mala = await api()
      .post(`/postulaciones/${p.id}/senales`, {
        fuente: 'manual',
        resumen: 'Oferta',
        estadoSugerido: 'oferta',
        confianza: 0.6,
      })
      .expect(201);
    const e = await api().post(`/postulaciones/${p.id}/senales/${mala.body.senal.id}/aplicar`).expect(422);
    expect(e.body.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('POST /discrepancias/:did/resolver corrige; resolverla otra vez da VALIDACION y una inexistente NO_ENCONTRADO', async () => {
    const p = await crear();
    await api()
      .post(`/postulaciones/${p.id}/transiciones`, {
        a: 'postulado',
        fechaPostulacion: hoy,
        canal: CANAL,
        version: 0,
      })
      .expect(200);
    const s = await api()
      .post(`/postulaciones/${p.id}/senales`, {
        fuente: 'manual',
        resumen: 'No continuaremos',
        estadoSugerido: 'rechazado',
        confianza: 0.9,
      })
      .expect(201);
    const did = s.body.postulacion.discrepancias[0].id;
    const r = await api()
      .post(`/postulaciones/${p.id}/discrepancias/${did}/resolver`, {
        decision: 'corregir',
        a: 'rechazado',
        motivo: 'Llegó el rechazo',
      })
      .expect(200);
    expect(r.body).toMatchObject({ estado: 'rechazado', discrepanciasAbiertas: 0 });
    await api()
      .post(`/postulaciones/${p.id}/discrepancias/${did}/resolver`, { decision: 'confirmar' })
      .expect(400);
    await api()
      .post(`/postulaciones/${p.id}/discrepancias/00000000-0000-7000-8000-000000000000/resolver`, {
        decision: 'confirmar',
      })
      .expect(404);
  });

  it('GET /postulaciones/resumen devuelve lo reciente y una fecha mala es VALIDACION', async () => {
    await crear();
    const r = await api().get('/postulaciones/resumen').expect(200);
    expect(r.body[0]).toMatchObject({ tipo: 'cambio', empresa: 'Empresa Ficticia' });
    await api().get('/postulaciones/resumen?desde=ayer').expect(400);
  });

  it('una ruta que no existe da NO_ENCONTRADO con la forma de error', async () => {
    const r = await api().get('/nada').expect(404);
    expect(r.body.codigo).toBe('NO_ENCONTRADO');
  });
});
