import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from '../../compartido/infraestructura/app-de-pruebas.prueba';
import { prismaDePrueba, vaciar } from '../../compartido/infraestructura/base-de-pruebas.prueba';

const prisma = prismaDePrueba();
let t: AppDePrueba;
let http: ReturnType<typeof request>;
let url: URL;
const auth = (r: request.Test, tipo: 'consola' | 'servicio' = 'consola') =>
  r.set('Authorization', `Bearer ${t.token(tipo)}`);

beforeAll(async () => {
  t = await appDePrueba();
  await t.app.listen(0, '127.0.0.1');
  const { port } = t.app.getHttpServer().address() as AddressInfo;
  url = new URL(`http://127.0.0.1:${port}/mcp`);
  http = request(t.app.getHttpServer());
});
beforeEach(() => vaciar(prisma));
afterAll(async () => {
  await t.app.close();
  await prisma.$disconnect();
});

const depto = {
  tipo: 'departamento',
  comuna: 'Ñuñoa',
  direccion: 'Av. Irarrázaval 3000',
  dormitorios: 2,
  precio: { monto: 550000, moneda: 'CLP' },
  gastosComunes: 90000,
  publicacion: { url: 'https://www.portalinmobiliario.com/MLC-1-depto?utm_source=x' },
};

describe('arriendos por REST', () => {
  it('crea, reconoce el canal por la URL, avisa duplicados y mueve de estado con origen', async () => {
    const r = await auth(http.post('/api/v1/arriendos/propiedades')).send(depto).expect(201);
    const p = r.body.propiedad;
    expect(p).toMatchObject({
      titulo: 'Departamento 2D en Ñuñoa',
      estado: 'vista',
      canales: ['portalinmobiliario'],
      precioPesos: 550000,
      cantidadContactos: 0,
    });
    expect(p.calce.puntaje).toBeNull();

    // La misma URL con otra forma: YA_EXISTE.
    const dup = await auth(http.post('/api/v1/arriendos/propiedades'))
      .send({ ...depto, publicacion: { url: 'portalinmobiliario.com/MLC-1-depto/' } })
      .expect(409);
    expect(dup.body.codigo).toBe('YA_EXISTE');

    // Misma dirección en otro portal: se crea y avisa el posible duplicado.
    const otra = await auth(http.post('/api/v1/arriendos/propiedades'))
      .send({
        ...depto,
        direccion: 'avenida irarrazaval 3000 depto 12',
        publicacion: { url: 'https://www.yapo.cl/x/9' },
      })
      .expect(201);
    expect(otra.body.posiblesDuplicados.map((x: { id: string }) => x.id)).toEqual([p.id]);
    const u = await auth(http.post(`/api/v1/arriendos/propiedades/${p.id}/unir`))
      .send({ origenId: otra.body.propiedad.id })
      .expect(200);
    expect(u.body.canales.sort()).toEqual(['portalinmobiliario', 'yapo']);

    const m = await auth(http.post(`/api/v1/arriendos/propiedades/${p.id}/estado`))
      .send({ a: 'visita_agendada', fechaVisita: '2026-12-01T15:00:00Z' })
      .expect(200);
    expect(m.body).toMatchObject({ estado: 'visita_agendada', proximaVisita: '2026-12-01T15:00:00.000Z' });
    expect(m.body.cambios[0]).toMatchObject({ a: 'visita_agendada', origen: 'consola' });
    await auth(http.post(`/api/v1/arriendos/propiedades/${p.id}/estado`))
      .send({ a: 'arrendada' })
      .expect(422);

    const l = await auth(http.get('/api/v1/arriendos/propiedades?abiertas=true')).expect(200);
    expect(l.body.resumen).toMatchObject({ total: 1, abiertas: 1 });
    const outbox = await prisma.outbox.findMany({ where: { tipo: { startsWith: 'propiedad.' } } });
    expect(outbox.map((e) => e.tipo)).toContain('propiedad.estado_cambiado');
  });

  it('contactos y conversaciones: te toca responder', async () => {
    const p = (await auth(http.post('/api/v1/arriendos/propiedades')).send(depto).expect(201)).body.propiedad;
    const c = await auth(http.post(`/api/v1/arriendos/propiedades/${p.id}/contactos`))
      .send({ nombre: 'Ana Corredora', rol: 'corredor', whatsapp: '9 8765 4321', canalId: 'whatsapp' })
      .expect(201);
    await auth(http.post(`/api/v1/arriendos/propiedades/${p.id}/interacciones`))
      .send({ contactoId: c.body.contactoId, tipo: 'mensaje_recibido', resumen: 'Puedes verlo el sábado' })
      .expect(201);
    const v = await auth(http.get(`/api/v1/arriendos/propiedades/${p.id}`)).expect(200);
    expect(v.body.pendiente).toBe('responder');
    expect(v.body.contactos[0]).toMatchObject({ whatsapp: '+56987654321', canalId: 'whatsapp' });
    expect(v.body.contactos[0].interacciones[0]).toMatchObject({ canalId: 'whatsapp', origen: 'consola' });
    await auth(http.post(`/api/v1/arriendos/propiedades/${p.id}/contactos`))
      .send({ nombre: 'X', canalId: 'paloma-mensajera' })
      .expect(400);
  });

  it('las reglas de búsqueda dan calce y brechas, y el historial guarda el motivo', async () => {
    const p = (await auth(http.post('/api/v1/arriendos/propiedades')).send(depto).expect(201)).body.propiedad;
    const b = await auth(http.put('/api/v1/arriendos/busqueda'))
      .send({
        reglas: [
          { criterio: 'presupuesto_total', valor: 600000 },
          { criterio: 'tipo', valor: ['casa'], dura: false, prioridad: 1 },
        ],
        persona: { rentaLiquida: 1800000 },
        motivo: 'Empiezo a buscar',
      })
      .expect(200);
    expect(b.body.reglas.map((r: { descripcion: string }) => r.descripcion)).toEqual([
      'Dura · Arriendo más gastos comunes hasta $600.000',
      'P1 · Tipo: casa',
    ]);
    expect(b.body.historial[0]).toMatchObject({ motivo: 'Empiezo a buscar', origen: 'consola' });
    const v = await auth(http.get(`/api/v1/arriendos/propiedades/${p.id}`)).expect(200);
    expect(v.body.calce).toMatchObject({ puntaje: 0, cumpleDuras: false });
    expect(v.body.calce.brechas[0].texto).toMatch(/Se pasa \$40\.000/);
    await auth(http.put('/api/v1/arriendos/busqueda'))
      .send({ reglas: [{ criterio: 'nada' }], motivo: 'x' })
      .expect(400);
  });

  it('una búsqueda guardada antes del perfil se lee con texto y etiquetas, y acepta cambios de a una', async () => {
    // Así quedó la búsqueda de Juan antes del perfil (docs/diseno/perfil.md §3.2).
    await prisma.busquedaArriendo.create({
      data: {
        id: 1,
        datos: {
          reglas: [
            { id: 'inicial-renta', criterio: 'renta_exigida', dura: true },
            { id: 'inicial-aval', criterio: 'aval', dura: true },
          ],
          persona: {},
          historial: [],
        },
        actualizadaEn: new Date(),
      },
    });
    const antes = await auth(http.get('/api/v1/arriendos/busqueda')).expect(200);
    expect(antes.body.reglas).toEqual([
      expect.objectContaining({ id: 'inicial-renta', texto: 'Renta exigida que cumples', etiquetas: [] }),
      expect.objectContaining({ id: 'inicial-aval', texto: 'Aval (si lo piden, lo tienes)', etiquetas: [] }),
    ]);
    const b = await auth(http.put('/api/v1/arriendos/busqueda'))
      .send({
        agregar: [
          { texto: 'Cerca de una estación de metro', dura: false, etiquetas: ['Ubicación'] },
          { criterio: 'tipo', valor: ['departamento'], dura: false, prioridad: 1 },
        ],
        cambiar: [{ id: 'inicial-aval', etiquetas: ['requisitos'] }],
        motivo: 'Juan pidió metro cerca',
      })
      .expect(200);
    expect(b.body.reglas.map((r: { descripcion: string }) => r.descripcion)).toEqual([
      'Dura · Renta exigida que cumples',
      'Dura · Aval (si lo piden, lo tienes) #requisitos',
      'P1 · Tipo: departamento',
      'P2 · Cerca de una estación de metro #ubicacion',
    ]);
    expect(b.body.criterios).toContain('comuna');
    await auth(http.put('/api/v1/arriendos/busqueda'))
      .send({ quitar: ['no-existe'], motivo: 'x' })
      .expect(404);
  });

  it('señales: con URL va a la propiedad (y la segura cambia el estado); sin propiedad, a la Bandeja', async () => {
    const p = (await auth(http.post('/api/v1/arriendos/propiedades')).send(depto).expect(201)).body.propiedad;
    const s = await auth(http.post('/api/v1/arriendos/senales'), 'servicio')
      .send({
        url: 'https://portalinmobiliario.com/MLC-1-depto',
        fuente: 'correo',
        resumen: 'El aviso fue dado de baja',
        estadoSugerido: 'no_disponible',
        confianza: 0.95,
        referenciaExterna: 'correo-1',
      })
      .expect(200);
    expect(s.body).toMatchObject({ destino: 'propiedad', propiedadId: p.id, aplicada: true });
    const repetida = await auth(http.post('/api/v1/arriendos/senales'), 'servicio')
      .send({
        url: 'https://portalinmobiliario.com/MLC-1-depto',
        fuente: 'correo',
        resumen: 'x',
        referenciaExterna: 'correo-1',
      })
      .expect(200);
    expect(repetida.body.destino).toBe('repetida');

    const b = await auth(http.post('/api/v1/arriendos/senales'), 'servicio')
      .send({
        fuente: 'correo',
        resumen: 'Te respondió un corredor',
        comuna: 'Providencia',
        referenciaExterna: 'correo-2',
        contacto: { nombre: 'Luis' },
      })
      .expect(200);
    expect(b.body.destino).toBe('bandeja');
    const bandeja = await auth(http.get('/api/v1/arriendos/bandeja')).expect(200);
    expect(bandeja.body).toHaveLength(1);
    const otra = (
      await auth(http.post('/api/v1/arriendos/propiedades')).send({ comuna: 'Providencia' }).expect(201)
    ).body.propiedad;
    const a = await auth(http.post(`/api/v1/arriendos/bandeja/${b.body.senalId}/asociar`))
      .send({ propiedadId: otra.id })
      .expect(200);
    expect(a.body.contactos.map((c: { nombre: string }) => c.nombre)).toEqual(['Luis']);
    expect((await auth(http.get('/api/v1/arriendos/bandeja')).expect(200)).body).toHaveLength(0);
  });

  it('canales: vienen los de partida y se agregan nuevos; el pin manual queda en el mapa', async () => {
    const cs = await auth(http.get('/api/v1/arriendos/canales')).expect(200);
    expect(cs.body.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining(['portalinmobiliario', 'whatsapp', 'yapo']),
    );
    const n = await auth(http.post('/api/v1/arriendos/canales'))
      .send({ nombre: 'Corredora Andes', tipo: 'corredora', dominios: ['corredoraandes.cl'] })
      .expect(201);
    expect(n.body).toMatchObject({ id: 'corredora-andes', predefinido: false });
    const p = (
      await auth(http.post('/api/v1/arriendos/propiedades'))
        .send({ ...depto, publicacion: { url: 'https://corredoraandes.cl/p/1' } })
        .expect(201)
    ).body.propiedad;
    expect(p.canales).toEqual(['corredora-andes']);
    await auth(http.put(`/api/v1/arriendos/propiedades/${p.id}/ubicacion`))
      .send({ lat: -33.45, lon: -70.6 })
      .expect(200);
    const mapa = await auth(http.get('/api/v1/arriendos/mapa')).expect(200);
    expect(mapa.body.ubicadas[0].ubicacion).toEqual({ lat: -33.45, lon: -70.6, origen: 'manual' });
  });
});

describe('arriendos por MCP', () => {
  async function cliente() {
    const c = new Client({ name: 'prueba', version: '1.0.0' });
    await c.connect(
      new StreamableHTTPClientTransport(url, {
        requestInit: { headers: { Authorization: `Bearer ${t.token('mcp')}` } },
      }),
    );
    return c;
  }
  const texto = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;

  it('la IA lee las reglas, crea sin duplicar, cambia una regla con motivo y queda con origen ia', async () => {
    const c = await cliente();
    const { instructions } = c.getInstructions()
      ? { instructions: c.getInstructions() }
      : { instructions: '' };
    expect(instructions).toMatch(/ver_perfil \(foco arriendos\)/);
    expect(texto(await c.callTool({ name: 'ver_perfil', arguments: { foco: 'arriendos' } }))).toMatch(
      /Renta exigida/,
    );

    const creada = texto(
      await c.callTool({
        name: 'crear_propiedad',
        arguments: {
          ...depto,
          contactos: [{ nombre: 'Ana', rol: 'corredor', telefono: '+56911112222', canalId: 'whatsapp' }],
        },
      }),
    );
    expect(creada).toMatch(/^Creada: Departamento 2D en Ñuñoa/);
    const dup = texto(
      await c.callTool({ name: 'buscar_duplicado_propiedad', arguments: { url: depto.publicacion.url } }),
    );
    expect(dup).toMatch(/^Ya la sigues/);
    const repetida = await c.callTool({ name: 'crear_propiedad', arguments: depto });
    expect(repetida.isError).toBe(true);
    expect(texto(repetida)).toMatch(/YA_EXISTE/);

    const editada = await c.callTool({
      name: 'editar_perfil',
      arguments: {
        foco: 'arriendos',
        agregar: [
          { criterio: 'tipo', valor: ['casa'], dura: false, prioridad: 1, etiquetas: ['tipo'] },
          { criterio: 'tipo', valor: ['departamento'], dura: false, prioridad: 2 },
        ],
        datos: { rentaLiquida: 1800000 },
        motivo: 'Juan pidió casas: casa pasa a P1',
      },
    });
    expect(texto(editada)).toMatch(/P1 · Tipo: casa #tipo/);
    const ajeno = await c.callTool({
      name: 'editar_perfil',
      arguments: { foco: 'arriendos', datos: { rentaPretendida: 1 }, motivo: 'x' },
    });
    expect(ajeno.isError).toBe(true);
    const b = await auth(http.get('/api/v1/arriendos/busqueda')).expect(200);
    expect(b.body.historial[0]).toMatchObject({ origen: 'ia', motivo: 'Juan pidió casas: casa pasa a P1' });

    const lista = await auth(http.get('/api/v1/arriendos/propiedades')).expect(200);
    const id = lista.body.items[0].id;
    await c.callTool({
      name: 'registrar_interaccion_arriendo',
      arguments: {
        id,
        contacto: { nombre: 'Ana', telefono: '+56911112222' },
        tipo: 'mensaje_enviado',
        resumen: 'Hola, ¿sigue disponible?',
        canalId: 'whatsapp',
      },
    });
    const v = await auth(http.get(`/api/v1/arriendos/propiedades/${id}`)).expect(200);
    expect(v.body).toMatchObject({ estado: 'contactada', pendiente: 'esperando', cantidadContactos: 1 });
    expect(v.body.cambios[0]).toMatchObject({ a: 'contactada', origen: 'ia' });

    const canal = texto(
      await c.callTool({
        name: 'registrar_canal',
        arguments: { nombre: 'Arriendos Sur', dominios: ['arriendossur.cl'] },
      }),
    );
    expect(canal).toMatch(/arriendos-sur/);
    await c.close();
  });
  it('lo que faltaba por MCP: discrepancias, señales, visitas, contactos, mapa, canales, UF, bandeja y borrar', async () => {
    const c = await cliente();
    const ver = async (id: string) =>
      (await auth(http.get(`/api/v1/arriendos/propiedades/${id}`)).expect(200)).body;
    const p = (await auth(http.post('/api/v1/arriendos/propiedades')).send(depto).expect(201)).body.propiedad;

    await c.callTool({
      name: 'registrar_senal_arriendo',
      arguments: {
        propiedadId: p.id,
        resumen: 'La corredora dice que ya la arrendaron',
        estadoSugerido: 'no_disponible',
      },
    });
    await c.callTool({ name: 'cambiar_estado_propiedad', arguments: { id: p.id, a: 'contactada' } });
    let v = await ver(p.id);
    expect(v.discrepancias).toHaveLength(1);
    const resuelta = await c.callTool({
      name: 'resolver_discrepancia_propiedad',
      arguments: { id: p.id, discrepanciaId: v.discrepancias[0].id },
    });
    expect(resuelta.isError).toBeFalsy();
    v = await ver(p.id);
    expect(v.discrepancias[0].estado).not.toBe('abierta');

    const aplicada = await c.callTool({
      name: 'aplicar_senal_arriendo',
      arguments: { id: p.id, senalId: v.senales[0].id },
    });
    expect(texto(aplicada)).toMatch(/no_disponible/);
    v = await ver(p.id);
    expect(v.cambios[0]).toMatchObject({ a: 'no_disponible', origen: 'ia' });

    const q = (
      await auth(http.post('/api/v1/arriendos/propiedades'))
        .send({ ...depto, direccion: 'Av. Grecia 100', publicacion: { url: 'https://www.yapo.cl/x/2' } })
        .expect(201)
    ).body.propiedad;
    await c.callTool({ name: 'agendar_visita', arguments: { id: q.id, fecha: '2026-12-01T11:00:00-03:00' } });
    v = await ver(q.id);
    await c.callTool({
      name: 'cambiar_visita',
      arguments: { id: q.id, visitaId: v.visitas[0].id, estado: 'hecha' },
    });
    await c.callTool({
      name: 'registrar_contacto_propiedad',
      arguments: { id: q.id, contacto: { nombre: 'Pedro', telefono: '+56933334444' } },
    });
    v = await ver(q.id);
    expect(v.visitas[0].estado).toBe('hecha');
    expect(v.contactos).toHaveLength(1);
    await c.callTool({
      name: 'quitar_contacto_propiedad',
      arguments: { id: q.id, contactoId: v.contactos[0].id },
    });
    await c.callTool({
      name: 'fijar_ubicacion_propiedad',
      arguments: { id: q.id, lat: -33.0398, lon: -71.5908 },
    });
    v = await ver(q.id);
    expect(v.contactos).toHaveLength(0);
    expect(v.ubicacion).toMatchObject({ lat: -33.0398, lon: -71.5908, origen: 'manual' });

    expect(
      (await c.callTool({ name: 'fijar_uf', arguments: { valor: 39500.5, fecha: '2026-11-26' } })).isError,
    ).toBeFalsy();
    const mala = await c.callTool({ name: 'fijar_uf', arguments: { valor: 39500, fecha: 'ayer' } });
    expect(mala.isError).toBe(true);

    expect(
      texto(await c.callTool({ name: 'editar_canal', arguments: { id: 'icasas', activo: false } })),
    ).toMatch(/inactivo/);

    await c.callTool({
      name: 'registrar_senal_arriendo',
      arguments: { resumen: 'Un correo de una corredora sin dirección', referenciaExterna: 'sin-propiedad' },
    });
    const bandeja = JSON.parse(
      texto(await c.callTool({ name: 'listar_bandeja_arriendos', arguments: {} })).split('\n\n')[1]!,
    );
    expect(bandeja).toHaveLength(1);
    await c.callTool({ name: 'descartar_senal_arriendo', arguments: { senalId: bandeja[0].id } });
    expect((await auth(http.get('/api/v1/arriendos/bandeja')).expect(200)).body).toHaveLength(0);

    expect(texto(await c.callTool({ name: 'borrar_propiedad', arguments: { id: q.id } }))).toMatch(
      /^Borrada/,
    );
    await auth(http.get(`/api/v1/arriendos/propiedades/${q.id}`)).expect(404);
    await c.close();
  });
});
