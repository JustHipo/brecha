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
        'aplicar_senal',
        'cambiar_estado',
        'crear_postulacion',
        'editar_postulacion',
        'exportar',
        'listar_discrepancias',
        'listar_postulaciones',
        'registrar_senal',
        'resolver_discrepancia',
        'resumen',
        'ver_postulacion',
      ].sort(),
    );
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
});
