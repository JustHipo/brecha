import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from '../../compartido/infraestructura/app-de-pruebas.prueba';
import { prismaDePrueba, vaciar } from '../../compartido/infraestructura/base-de-pruebas.prueba';

const prisma = prismaDePrueba();
let t: AppDePrueba;
let http: ReturnType<typeof request>;
let token: string;

const EJEMPLOS = resolve(__dirname, '../../../../../datos/ejemplo/csv');
const POSTULACIONES = readFileSync(`${EJEMPLOS}/postulaciones.csv`, 'utf8');
const CONTACTOS = readFileSync(`${EJEMPLOS}/contactos.csv`, 'utf8');

type Fila = { fila: number; resultado: string; advertencias: string[]; campo?: string; codigo?: string };

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
const importar = (csv: string, extra: object = {}) =>
  auth(http.post('/api/v1/csv/importar')).send({ csv, ...extra });
const exportar = async (tipo: string) => {
  const r = await auth(http.get(`/api/v1/csv/exportar/${tipo}`))
    .buffer(true)
    .expect(200);
  return r.text;
};

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

describe('importar CSV (docs/diseno/csv.md)', () => {
  it('postulaciones: crea cada fila en su estado y la segunda vez todas «ya estaban»', async () => {
    const r = await importar(POSTULACIONES).expect(200);
    expect(r.body).toMatchObject({ tipo: 'postulaciones', creadas: 6, yaEstaban: 0, errores: 0 });
    expect(r.body.filas.map((f: Fila) => f.fila)).toEqual([2, 3, 4, 7, 8, 9]);

    const lista = await auth(http.get('/api/v1/postulaciones?limit=50')).expect(200);
    const porEmpresa = Object.fromEntries(
      lista.body.items.map((i: { empresa: string }) => [i.empresa, i]),
    ) as Record<string, { id: string; estado: string; prioridad: string; etiquetas: string[] }>;
    expect(porEmpresa['Observatorio Ficticio']).toMatchObject({
      estado: 'sin_decidir',
      prioridad: 'alta',
      etiquetas: ['investigacion', 'p1'],
    });
    expect(porEmpresa['Clínica Ficticia']!.estado).toBe('entrevista');
    expect(porEmpresa['Laboratorio Ficticio']!.estado).toBe('descartado');

    const obs = await auth(
      http.get(`/api/v1/postulaciones/${porEmpresa['Observatorio Ficticio']!.id}`),
    ).expect(200);
    expect(obs.body.aviso).toMatchObject({
      stack: ['Python', 'MATLAB', 'LabVIEW'],
      sueldoPublicado: 'CLP 150.000 al mes',
      plataforma: 'sitio_empresa',
    });
    expect(obs.body.contactos).toEqual([
      expect.objectContaining({ rol: 'Postulación por correo', email: 'practicas@observatorio.test' }),
    ]);
    expect(obs.body.historial[0]).toMatchObject({ de: null, a: 'sin_decidir', origen: 'importacion' });
    const oce = await auth(http.get(`/api/v1/postulaciones/${porEmpresa['Instituto Ficticio']!.id}`)).expect(
      200,
    );
    expect(oce.body.historial[0]).toMatchObject({ a: 'rechazado', motivo: 'No seleccionada en esta etapa' });
    expect(oce.body.discrepanciasAbiertas).toBe(0);

    const r2 = await importar(POSTULACIONES).expect(200);
    expect(r2.body).toMatchObject({ creadas: 0, yaEstaban: 6, errores: 0 });
    expect(await prisma.postulacion.count()).toBe(6);
  });

  it('las filas malas se informan con su línea y columna, y no cortan las demás', async () => {
    const csv = [
      'titulo,empresa,url,estado,prioridad,color',
      'Buena,Ficticia,https://ejemplo.test/a,,,',
      'Sin fecha,Ficticia,https://ejemplo.test/b,postulado,,',
      'Prioridad mala,Ficticia,https://ejemplo.test/c,,urgente,',
      ',Ficticia,https://ejemplo.test/d,,,',
      'Otra buena,Ficticia,https://ejemplo.test/e,,,',
    ].join('\n');
    const r = await importar(csv).expect(200);
    expect(r.body).toMatchObject({
      creadas: 2,
      errores: 3,
      advertencias: ['Columnas que no se usan: color'],
    });
    const errores = r.body.filas.filter((f: Fila) => f.resultado === 'error');
    expect(errores.map((f: Fila) => [f.fila, f.campo, f.codigo])).toEqual([
      [3, 'fecha_postulacion', 'VALIDACION'],
      [4, 'prioridad', 'VALIDACION'],
      [5, 'titulo', 'VALIDACION'],
    ]);
  });

  it('un encabezado que no se reconoce o sin columnas obligatorias corta con VALIDACION', async () => {
    const r = await importar('a,b\n1,2').expect(400);
    expect(r.body).toMatchObject({ codigo: 'VALIDACION', campo: 'csv' });
    const r2 = await importar('titulo,url\nA,https://x.test', { tipo: 'postulaciones' }).expect(400);
    expect(r2.body.mensaje).toMatch(/empresa/);
    await importar('titulo;empresa;url\nA;B;C').expect(400);
  });

  it('contactos: ligados por URL, uno sin LinkedIn y uno con URL inexistente como advertencias; dos veces deja lo mismo', async () => {
    await importar(POSTULACIONES).expect(200);
    const r = await importar(CONTACTOS).expect(200);
    expect(r.body).toMatchObject({
      tipo: 'contactos',
      creadas: 3,
      actualizadas: 1,
      errores: 0,
      conAdvertencias: 2,
    });
    expect(r.body.filas.map((f: Fila) => [f.fila, f.resultado, f.advertencias.length])).toEqual([
      [2, 'creada', 0],
      [3, 'actualizada', 0],
      [4, 'creada', 1],
      [5, 'creada', 1],
    ]);

    const red = await auth(http.get('/api/v1/red')).expect(200);
    const ana = red.body.items.find((c: { nombre: string }) => c.nombre === 'Ana Ficticia');
    expect(ana.perfilUrl).toBe('https://www.linkedin.com/in/ana-ficticia');
    expect(ana.postulacionIds).toHaveLength(2);
    expect(ana.notas).toBe(
      'Correo: ana@observatorio.test\nMotivo: Lidera el área de la práctica\nMensaje sugerido: Hola Ana, vi la práctica de instrumentación y me interesa mucho.',
    );
    const bruno = red.body.items.find((c: { nombre: string }) => c.nombre === 'Bruno Ficticio');
    expect(bruno).toMatchObject({ perfilUrl: null, postulacionIds: [] });

    const r2 = await importar(CONTACTOS).expect(200);
    expect(r2.body).toMatchObject({ creadas: 0, actualizadas: 0, yaEstaban: 4 });
    expect(await prisma.contactoRed.count()).toBe(3);
  });

  it('ida y vuelta: exportar e importar en una Brecha vacía deja lo mismo', async () => {
    await importar(POSTULACIONES).expect(200);
    await importar(CONTACTOS).expect(200);
    const p1 = await exportar('postulaciones');
    const c1 = await exportar('contactos');
    expect(p1.startsWith('﻿titulo,empresa,url,')).toBe(true);

    await vaciar(prisma);
    const rp = await importar(p1).expect(200);
    expect(rp.body).toMatchObject({ creadas: 6, errores: 0 });
    const rc = await importar(c1).expect(200);
    expect(rc.body.errores).toBe(0);

    expect(await exportar('postulaciones')).toBe(p1);
    expect(await exportar('contactos')).toBe(c1);
  });

  it('exportar responde un archivo para descargar y las plantillas se pueden importar', async () => {
    const r = await auth(http.get('/api/v1/csv/exportar/postulaciones')).expect(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toMatch(
      /attachment; filename="brecha-postulaciones-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    await auth(http.get('/api/v1/csv/exportar/otra-cosa')).expect(400);

    const plantilla = await auth(http.get('/api/v1/csv/plantillas/postulaciones')).buffer(true).expect(200);
    const ri = await importar(plantilla.text).expect(200);
    expect(ri.body).toMatchObject({ creadas: 2, errores: 0 });
    const pc = await auth(http.get('/api/v1/csv/plantillas/contactos')).buffer(true).expect(200);
    const rc = await importar(pc.text).expect(200);
    expect(rc.body).toMatchObject({ creadas: 2, errores: 0 });
  });

  it('un archivo grande (más de 100 KB) se importa entero', async () => {
    const filas = Array.from(
      { length: 400 },
      (_, i) => `Práctica ${i},Ficticia,https://ejemplo.test/grande/${i},"${'Requisito largo. '.repeat(30)}"`,
    );
    const csv = ['titulo,empresa,url,requisitos', ...filas].join('\n');
    expect(csv.length).toBeGreaterThan(150_000);
    const r = await importar(csv).expect(200);
    expect(r.body).toMatchObject({ creadas: 400, errores: 0 });
  });
});
