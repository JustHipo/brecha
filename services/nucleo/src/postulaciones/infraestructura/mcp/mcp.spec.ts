import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from '../../../compartido/infraestructura/app-de-pruebas.prueba';
import { prismaDePrueba, vaciar } from '../../../compartido/infraestructura/base-de-pruebas.prueba';

const prisma = prismaDePrueba();
let t: AppDePrueba;
let url: URL;

async function cliente(token: string) {
  const c = new Client({ name: 'prueba', version: '1.0.0' });
  await c.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return c;
}

type Texto = { content: { type: string; text: string }[]; isError?: boolean };
const json = (r: unknown) => {
  const texto = (r as Texto).content[0]!.text;
  const i =
    texto.indexOf('{') >= 0 && (texto.indexOf('[') < 0 || texto.indexOf('{') < texto.indexOf('['))
      ? texto.indexOf('{')
      : texto.indexOf('[');
  return JSON.parse(texto.slice(i));
};

beforeAll(async () => {
  t = await appDePrueba();
  await t.app.listen(0, '127.0.0.1');
  const { port } = t.app.getHttpServer().address() as AddressInfo;
  url = new URL(`http://127.0.0.1:${port}/mcp`);
});
beforeEach(() => vaciar(prisma));
afterAll(async () => {
  await t.app.close();
  await prisma.$disconnect();
});

describe('servidor MCP por HTTP (F1-10c)', () => {
  it('lista las herramientas de PLAN §12.2', async () => {
    const c = await cliente(t.token('mcp'));
    const { tools } = await c.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual(
      [
        'agendar_entrevista',
        'agregar_contacto',
        'agregar_nota',
        'asociar_senal',
        'aplicar_senal',
        'cambiar_estado',
        'crear_postulacion',
        'editar_postulacion',
        'exportar',
        'exportar_csv',
        'importar_csv',
        'editar_contacto_red',
        'editar_paso',
        'listar_pasos',
        'registrar_paso',
        'resolver_paso',
        'listar_bandeja',
        'listar_etiquetas',
        'listar_discrepancias',
        'listar_postulaciones',
        'listar_red',
        'registrar_contacto_red',
        'registrar_interaccion_red',
        'ver_contacto_red',
        'registrar_resultado_entrevista',
        'registrar_senal',
        'resolver_discrepancia',
        'resumen',
        'ver_postulacion',
      ].sort(),
    );
    await c.close();
  });

  it('registrar_resultado_entrevista marca la entrevista sin mover la postulación; una entrevista que no existe da NO_ENCONTRADO', async () => {
    const c = await cliente(t.token('mcp'));
    const creada = json(
      await c.callTool({
        name: 'crear_postulacion',
        arguments: {
          titulo: 'Full Stack',
          empresa: 'Consultora Ficticia',
          url: 'https://ejemplo.test/mcp-entrevista',
          plataforma: 'otra',
        },
      }),
    );
    await c.callTool({ name: 'cambiar_estado', arguments: { id: creada.id, a: 'por_postular' } });
    await c.callTool({
      name: 'cambiar_estado',
      arguments: {
        id: creada.id,
        a: 'postulado',
        fechaPostulacion: '2026-11-24',
        canal: { tipo: 'email', valor: 'seleccion@ejemplo.test' },
      },
    });
    const agendada = json(
      await c.callTool({
        name: 'agendar_entrevista',
        arguments: { id: creada.id, fecha: '2026-11-25T14:00:00.000Z', tipo: 'rrhh' },
      }),
    );
    const entrevistaId = agendada.entrevistas[0].id as string;

    const marcada = json(
      await c.callTool({
        name: 'registrar_resultado_entrevista',
        arguments: { id: creada.id, entrevistaId, resultado: 'avanza' },
      }),
    );
    expect(marcada.entrevistas[0]).toMatchObject({ id: entrevistaId, resultado: 'avanza' });
    expect(marcada.estado).toBe('entrevista');

    const mala = (await c.callTool({
      name: 'registrar_resultado_entrevista',
      arguments: { id: creada.id, entrevistaId: 'no-existe', resultado: 'avanza' },
    })) as Texto;
    expect(mala.isError).toBe(true);
    expect(JSON.parse(mala.content[0]!.text)).toMatchObject({ codigo: 'NO_ENCONTRADO' });
    await c.close();
  });

  it('sin el token de MCP no conecta', async () => {
    await expect(cliente(t.token('consola'))).rejects.toThrow();
  });

  it('listar, mover (origen ia), registrar una señal y un salto inválido da TRANSICION_INVALIDA', async () => {
    const c = await cliente(t.token('mcp'));
    const creada = json(
      await c.callTool({
        name: 'crear_postulacion',
        arguments: {
          titulo: 'Backend',
          empresa: 'Empresa Ficticia',
          url: 'https://ejemplo.test/mcp',
          plataforma: 'linkedin',
        },
      }),
    );
    const lista = json(await c.callTool({ name: 'listar_postulaciones', arguments: {} }));
    expect(lista.total).toBe(1);

    const movida = json(
      await c.callTool({ name: 'cambiar_estado', arguments: { id: creada.id, a: 'por_postular' } }),
    );
    expect(movida.historial[0]).toMatchObject({ a: 'por_postular', origen: 'ia' });

    const senal = json(
      await c.callTool({
        name: 'registrar_senal',
        arguments: {
          id: creada.id,
          fuente: 'correo',
          resumen: 'Nos interesa tu perfil',
          confianza: 0.7,
          referenciaExterna: '<mcp@1>',
        },
      }),
    );
    expect(senal.senal.aplicada).toBe(false);

    const mala = (await c.callTool({
      name: 'cambiar_estado',
      arguments: { id: creada.id, a: 'oferta' },
    })) as Texto;
    expect(mala.isError).toBe(true);
    expect(JSON.parse(mala.content[0]!.text)).toMatchObject({ codigo: 'TRANSICION_INVALIDA' });

    const x = json(await c.callTool({ name: 'exportar', arguments: {} }));
    expect(x.conteos.porEstado.por_postular).toBe(1);
    const r = await c.readResource({ uri: `brecha://postulaciones/${creada.id}` });
    expect(JSON.parse((r.contents[0] as { text: string }).text).id).toBe(creada.id);
    await c.close();
  });

  it('la red de LinkedIn: registrar por perfil, mensaje que te toca responder y ligar a una postulación', async () => {
    const c = await cliente(t.token('mcp'));
    const creada = json(
      await c.callTool({
        name: 'crear_postulacion',
        arguments: {
          titulo: 'Backend',
          empresa: 'Ficticia',
          url: 'https://ejemplo.test/red',
          plataforma: 'linkedin',
        },
      }),
    );
    const r = json(
      await c.callTool({
        name: 'registrar_interaccion_red',
        arguments: {
          perfilUrl: 'https://www.linkedin.com/in/ana-ficticia/',
          nombre: 'Ana Ficticia',
          tipo: 'mensaje_recibido',
          resumen: 'Pregunta si sigo disponible para la entrevista',
          ocurridaEn: '2026-11-20T12:00:00Z',
        },
      }),
    );
    expect(r).toMatchObject({ nombre: 'Ana Ficticia', pendiente: 'responder', agregada: true });
    const repetida = json(
      await c.callTool({
        name: 'registrar_interaccion_red',
        arguments: {
          id: r.id,
          tipo: 'mensaje_recibido',
          resumen: 'Pregunta si sigo disponible para la entrevista',
          ocurridaEn: '2026-11-20T15:00:00Z',
        },
      }),
    );
    expect(repetida.agregada).toBe(false);
    // El chat de LinkedIn da el id interno del perfil; con el mismo nombre es el mismo contacto, no uno nuevo.
    const porIdInterno = json(
      await c.callTool({
        name: 'registrar_interaccion_red',
        arguments: {
          perfilUrl: 'https://www.linkedin.com/in/ACoAAEgiV0IBnSD73tmvFKfG',
          nombre: 'Ána Ficticia',
          tipo: 'nota',
          resumen: 'Es reclutadora de Ficticia',
          ocurridaEn: '2026-11-20T16:00:00Z',
        },
      }),
    );
    expect(porIdInterno).toMatchObject({ id: r.id, pendiente: 'responder', agregada: true });
    await c.callTool({ name: 'editar_contacto_red', arguments: { id: r.id, vincular: creada.id } });
    const lista = await c.callTool({
      name: 'listar_red',
      arguments: { filtro: 'responder', postulacionId: creada.id },
    });
    expect((lista as Texto).content[0]!.text).toContain('Ana Ficticia');
    const malo = (await c.callTool({
      name: 'registrar_contacto_red',
      arguments: { nombre: 'X', perfilUrl: 'https://ejemplo.test/x' },
    })) as Texto;
    expect(malo.isError).toBe(true);
    await c.close();
  });

  it('etiquetas: crear con etiquetas y stack, filtrar, listar las en uso y editar la prioridad', async () => {
    const c = await cliente(t.token('mcp'));
    const creada = json(
      await c.callTool({
        name: 'crear_postulacion',
        arguments: {
          titulo: 'Práctica en óptica',
          empresa: 'Observatorio Ficticio',
          url: 'https://ejemplo.test/practica',
          plataforma: 'otra',
          stack: ['Python'],
          etiquetas: ['Investigación'],
        },
      }),
    );
    expect(creada).toMatchObject({ etiquetas: ['investigacion'], aviso: { stack: ['Python'] } });
    const lista = json(
      await c.callTool({ name: 'listar_postulaciones', arguments: { etiquetas: ['investigación'] } }),
    );
    expect(lista.total).toBe(1);
    const enUso = json(await c.callTool({ name: 'listar_etiquetas', arguments: {} }));
    expect(enUso).toEqual([{ etiqueta: 'investigacion', total: 1 }]);
    const editada = json(
      await c.callTool({
        name: 'editar_postulacion',
        arguments: { id: creada.id, version: creada.version, prioridad: 'alta', etiquetas: ['practica'] },
      }),
    );
    expect(editada).toMatchObject({ prioridad: 'alta', prioridadFijada: 'alta', etiquetas: ['practica'] });
  });

  it('importar_csv informa filas y advertencias; exportar_csv devuelve el mismo formato', async () => {
    const c = await cliente(t.token('mcp'));
    const csv =
      'titulo,empresa,url,estado\nPráctica,Ficticia,https://ejemplo.test/mcp,\nMala,Ficticia,https://ejemplo.test/mala,postulado\n';
    const r = await c.callTool({ name: 'importar_csv', arguments: { csv } });
    const texto = (r as Texto).content[0]!.text;
    expect(texto).toMatch(/1 creadas, 0 ya estaban, 0 actualizadas, 1 con error/);
    expect(texto).toMatch(/línea 3 · error en fecha_postulacion/);
    const exp = await c.callTool({ name: 'exportar_csv', arguments: { tipo: 'postulaciones' } });
    const salida = (exp as Texto).content[0]!.text;
    expect(salida).toContain('https://ejemplo.test/mcp');
    expect(salida.split('\n')[0]).toMatch(/^\uFEFF?titulo,empresa,url,plataforma/);
  });

  it('pasos pendientes: registrar (también en una cerrada), listar, buscar por URL y resolver como IA', async () => {
    const c = await cliente(t.token('mcp'));
    const lanek = json(
      await c.callTool({
        name: 'crear_postulacion',
        arguments: {
          titulo: 'Ingeniero/a de Software Backend & IA',
          empresa: 'Lanek',
          url: 'https://www.chiletrabajos.cl/trabajo/ingeniero-de-software-backend-ia-3916453',
          plataforma: 'chiletrabajos',
        },
      }),
    );
    await c.callTool({
      name: 'cambiar_estado',
      arguments: { id: lanek.id, a: 'descartado', motivo: 'Ya no me interesa' },
    });
    const porUrl = json(await c.callTool({ name: 'listar_postulaciones', arguments: { url: '3916453' } }));
    expect(porUrl.items.map((x: { id: string }) => x.id)).toEqual([lanek.id]);

    const paso = json(
      await c.callTool({
        name: 'registrar_paso',
        arguments: {
          postulacionIds: [lanek.id],
          descripcion: 'Completar el test de personalidad',
          detalle: 'Etapa 2 en Chiletrabajos',
          plazo: '2026-12-01',
          referenciaExterna: 'portal:chiletrabajos:3916453:test',
        },
      }),
    );
    expect(paso).toMatchObject({
      estado: 'pendiente',
      fuente: 'portal',
      registradoPor: 'ia',
      yaEstaba: false,
    });
    const otra = json(
      await c.callTool({
        name: 'registrar_paso',
        arguments: {
          postulacionIds: [lanek.id],
          descripcion: 'Completar el test de personalidad',
          referenciaExterna: 'portal:chiletrabajos:3916453:test',
        },
      }),
    );
    expect(otra).toMatchObject({ id: paso.id, yaEstaba: true });

    const pendientes = json(await c.callTool({ name: 'listar_pasos', arguments: {} }));
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].postulaciones[0]).toMatchObject({ empresa: 'Lanek', estado: 'descartado' });

    const ficha = json(await c.callTool({ name: 'ver_postulacion', arguments: { id: lanek.id } }));
    expect(ficha.pasosPendientes).toHaveLength(1);

    const hecho = json(
      await c.callTool({ name: 'resolver_paso', arguments: { id: paso.id, estado: 'hecho', nota: 'Listo' } }),
    );
    expect(hecho).toMatchObject({ estado: 'hecho', cierre: { por: 'ia', nota: 'Listo' } });
    expect(json(await c.callTool({ name: 'listar_pasos', arguments: {} }))).toHaveLength(0);
    const malo = await c.callTool({ name: 'resolver_paso', arguments: { id: paso.id, estado: 'hecho' } });
    expect((malo as Texto).isError).toBe(true);
    expect(await prisma.outbox.count({ where: { tipo: 'paso.detectado' } })).toBe(1);
  });

  it('un mensaje de LinkedIn con un pedido deja el paso en las postulaciones del contacto', async () => {
    const c = await cliente(t.token('mcp'));
    const p = json(
      await c.callTool({
        name: 'crear_postulacion',
        arguments: {
          titulo: 'Backend',
          empresa: 'Ficticia',
          url: 'https://ejemplo.test/li',
          plataforma: 'linkedin',
        },
      }),
    );
    const sinLigar = await c.callTool({
      name: 'registrar_interaccion_red',
      arguments: {
        perfilUrl: 'https://www.linkedin.com/in/persona-ficticia/',
        nombre: 'Persona Ficticia',
        tipo: 'mensaje_recibido',
        resumen: 'Me pide el CV',
        paso: { descripcion: 'Mandar el CV a Persona' },
      },
    });
    expect((sinLigar as Texto).content[0]!.text).toMatch(/El paso NO se registró/);
    const r = json(
      await c.callTool({
        name: 'registrar_interaccion_red',
        arguments: {
          perfilUrl: 'https://www.linkedin.com/in/persona-ficticia/',
          tipo: 'mensaje_recibido',
          resumen: 'Me pide el CV actualizado',
          referenciaExterna: 'linkedin:msg:42',
          paso: {
            descripcion: 'Contestar a Persona con tu CV',
            detalle: 'Responde su mensaje adjuntando el CV en PDF',
            postulacionIds: [p.id],
          },
        },
      }),
    );
    expect(r.paso).toMatchObject({
      fuente: 'linkedin',
      registradoPor: 'ia',
      contactoRedId: r.contacto.id,
      postulacionIds: [p.id],
    });
  });

  it('registrar_senal con varias postulaciones y un paso deja una señal en cada una y un solo paso', async () => {
    const c = await cliente(t.token('mcp'));
    const crear = async (n: number) =>
      json(
        await c.callTool({
          name: 'crear_postulacion',
          arguments: {
            titulo: `Cargo ${n}`,
            empresa: 'Tenpo',
            url: `https://tenpo.teamtailor.com/jobs/${n}000000-cargo`,
            plataforma: 'sitio_empresa',
          },
        }),
      );
    const a = await crear(1);
    const b = await crear(2);
    const r = json(
      await c.callTool({
        name: 'registrar_senal',
        arguments: {
          postulacionIds: [a.id, b.id],
          fuente: 'correo',
          resumen: 'Completa tu perfil en el portal de Tenpo',
          confianza: 0.8,
          referenciaExterna: '<tenpo@x>',
          paso: { descripcion: 'Completar el perfil en Teamtailor' },
        },
      }),
    );
    expect(r.senales).toHaveLength(2);
    expect(r).toMatchObject({ accion: 'creado', paso: { registradoPor: 'ia' } });
    expect(await prisma.senal.count({ where: { referenciaExterna: '<tenpo@x>' } })).toBe(2);
    expect(await prisma.paso.count()).toBe(1);
  });
});
