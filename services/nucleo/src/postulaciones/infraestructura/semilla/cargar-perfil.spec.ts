import { existsSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDePrueba, type AppDePrueba } from '../../../compartido/infraestructura/app-de-pruebas.prueba';
import { prismaDePrueba, vaciar } from '../../../compartido/infraestructura/base-de-pruebas.prueba';
import { cargarPerfil, validarSemilla } from './cargar-perfil';

const prisma = prismaDePrueba();
let t: AppDePrueba;
let url: string;
const raiz = resolve(__dirname, '../../../../../..');
const leer = (ruta: string) => validarSemilla(JSON.parse(readFileSync(resolve(raiz, ruta), 'utf8')));
// La semilla real vive fuera del repo (ADR 0008): solo se prueba donde existe.
const PRIVADA = resolve(raiz, '../../../datos/privado/perfil-empleo.json');

beforeAll(async () => {
  t = await appDePrueba();
  await t.app.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${(t.app.getHttpServer().address() as AddressInfo).port}`;
});
beforeEach(() => vaciar(prisma));
afterAll(async () => {
  await t.app.close();
  await prisma.$disconnect();
});

describe('cargar la semilla del perfil (perfil.md §6)', () => {
  it('carga el ejemplo con origen importacion y la segunda vez no cambia nada', async () => {
    const semilla = leer('datos/ejemplo/perfil-empleo.json');
    const c = { url, token: t.token('servicio') };
    const r = await cargarPerfil(semilla, c);
    expect(r).toEqual({
      accion: 'cargado',
      reglas: [
        'Dura · Backend o datos; nada de soporte #rol',
        'Dura · Santiago híbrido o remoto; Valparaíso también presencial; otro lugar solo remoto #ubicacion',
        'P1 · Con sueldo publicado de $1.000.000 o más #sueldo',
        'P2 · Empresa de producto antes que consultora #empresa',
      ],
    });
    expect(await cargarPerfil(semilla, c)).toEqual({ accion: 'igual' });
    const fila = await prisma.perfilEmpleo.findUnique({ where: { id: 1 } });
    const historial = (fila!.datos as { historial: { origen: string }[] }).historial;
    expect(historial.map((h) => h.origen)).toEqual(['importacion']);
  });

  it('rechaza un archivo sin reglas', () => {
    expect(() => validarSemilla({ datos: {} })).toThrow(/reglas/);
  });

  it.runIf(existsSync(PRIVADA))('la semilla privada de Juan carga y es idempotente', async () => {
    const semilla = validarSemilla(JSON.parse(readFileSync(PRIVADA, 'utf8')));
    const c = { url, token: t.token('servicio') };
    expect((await cargarPerfil(semilla, c)).accion).toBe('cargado');
    expect(await cargarPerfil(semilla, c)).toEqual({ accion: 'igual' });
  });
});
