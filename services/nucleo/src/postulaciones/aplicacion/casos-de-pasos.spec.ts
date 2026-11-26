import { describe, expect, it } from 'vitest';
import { AVISO } from '../dominio/fabrica.prueba';
import { AsociarSenal, RecibirSenal } from './casos-de-bandeja';
import { CambiarEstado, CrearPostulacion } from './casos-de-escritura';
import { EditarPaso, ListarPasos, RegistrarPaso, ResolverPaso } from './casos-de-pasos';
import { contextoDePrueba } from './en-memoria.prueba';
import { ListarPostulaciones, VerPostulacion, VerTablero } from './casos-de-lectura';

const CANAL = { tipo: 'portal', valor: 'Chiletrabajos' };
const LANEK = {
  ...AVISO,
  titulo: 'Ingeniero/a de Software Backend & IA',
  empresa: 'Lanek',
  url: 'https://www.chiletrabajos.cl/trabajo/ingeniero-de-software-backend-ia-3916453',
  plataforma: 'chiletrabajos',
};
const TEST = {
  fuente: 'correo' as const,
  plataforma: 'chiletrabajos' as const,
  resumen: 'Te piden completar un test de personalidad',
  estadoSugerido: 'en_proceso' as const,
  confianza: 0.95,
  referenciaExterna: '<test@chiletrabajos>',
  recibidaEn: new Date('2026-11-23T10:03:05Z'),
  paso: { descripcion: 'Completar el test de personalidad', plazo: '2026-11-30' },
};

async function postulada(c: ReturnType<typeof contextoDePrueba>['c'], aviso: object = LANEK) {
  return new CrearPostulacion(c).ejecutar({
    aviso: aviso as typeof LANEK,
    estado: 'postulado',
    fechaPostulacion: '2026-11-15',
    canal: CANAL,
    origen: 'formulario',
  });
}

describe('pasos pendientes (docs/diseno/pasos.md)', () => {
  it('un correo que pide algo crea el paso, avisa y la tarjeta lo muestra', async () => {
    const { c, pasos } = contextoDePrueba();
    const p = await postulada(c);
    const r = await new RecibirSenal(c).ejecutar({ ...TEST, postulacionId: p.id });
    expect(r).toMatchObject({ destino: 'postulacion', accion: 'creado' });
    expect(pasos.outbox).toEqual(['paso.detectado']);
    const tablero = await new VerTablero(c).ejecutar();
    const tarjeta = tablero.columnas.flatMap((x) => x.items).find((x) => x.id === p.id)!;
    expect(tarjeta.pasosPendientes).toEqual([
      expect.objectContaining({
        descripcion: 'Completar el test de personalidad',
        plazo: '2026-11-30',
        diasAlPlazo: 7,
      }),
    ]);
    const ficha = await new VerPostulacion(c).ejecutar(p.id);
    expect(ficha.pasos[0]).toMatchObject({
      fuente: 'correo',
      registradoPor: 'vigia',
      referenciaExterna: '<test@chiletrabajos>',
      pedidoEn: '2026-11-23T10:03:05.000Z',
      postulaciones: [{ id: p.id, empresa: 'Lanek', estado: 'postulado' }],
    });
  });

  it('R18 y J6: un pedido para una postulación cerrada queda pendiente y se ve', async () => {
    const { c } = contextoDePrueba();
    const p = await postulada(c);
    await new CambiarEstado(c).ejecutar({ id: p.id, a: 'rechazado', motivo: 'Puesto ocupado', origen: 'ia' });
    await new RecibirSenal(c).ejecutar({ ...TEST, estadoSugerido: undefined, postulacionId: p.id });
    const [paso] = await new ListarPasos(c).ejecutar({ estado: 'pendiente' });
    expect(paso).toMatchObject({ estado: 'pendiente', postulaciones: [{ estado: 'rechazado' }] });
  });

  it('un correo de varias postulaciones crea una señal en cada una y un solo paso; D27 no se aplica (P4)', async () => {
    const { c, ajustes } = contextoDePrueba();
    ajustes.seguras = true;
    const a = await postulada(c, { ...AVISO, empresa: 'Tenpo', url: 'https://tenpo.teamtailor.com/jobs/1' });
    const b = await postulada(c, { ...AVISO, empresa: 'Tenpo', url: 'https://tenpo.teamtailor.com/jobs/2' });
    const r = await new RecibirSenal(c).ejecutar({ ...TEST, postulacionIds: [a.id, b.id] });
    if (r.destino !== 'postulacion') throw new Error('esperaba postulación');
    expect(r.senales.map((x) => [x.repetida, x.aplicada])).toEqual([
      [false, false],
      [false, false],
    ]);
    expect(r.paso?.postulacionIds.sort()).toEqual([a.id, b.id].sort());
    expect((await new VerPostulacion(c).ejecutar(a.id)).estado).toBe('postulado');
    expect(await new ListarPasos(c).ejecutar()).toHaveLength(1);
  });

  it('con una sola postulación D27 sigue aplicando el estado seguro', async () => {
    const { c, ajustes } = contextoDePrueba();
    ajustes.seguras = true;
    const p = await postulada(c);
    await new RecibirSenal(c).ejecutar({ ...TEST, postulacionId: p.id });
    expect((await new VerPostulacion(c).ejecutar(p.id)).estado).toBe('en_proceso');
  });

  it('repetir el mismo correo no duplica señales ni pasos y da YA_EXISTE', async () => {
    const { c } = contextoDePrueba();
    const p = await postulada(c);
    await new RecibirSenal(c).ejecutar({ ...TEST, postulacionId: p.id });
    await expect(new RecibirSenal(c).ejecutar({ ...TEST, postulacionId: p.id })).rejects.toMatchObject({
      codigo: 'YA_EXISTE',
    });
    expect(await new ListarPasos(c).ejecutar()).toHaveLength(1);
  });

  it('R19: un recordatorio del mismo paso (mismoQue) actualiza el plazo sin crear otro', async () => {
    const { c } = contextoDePrueba();
    const p = await postulada(c);
    const r = await new RecibirSenal(c).ejecutar({ ...TEST, postulacionId: p.id });
    const pasoId = r.destino === 'postulacion' ? r.paso!.id : '';
    const r2 = await new RecibirSenal(c).ejecutar({
      ...TEST,
      estadoSugerido: undefined,
      postulacionId: p.id,
      referenciaExterna: '<recordatorio@chiletrabajos>',
      paso: { descripcion: 'Completar el test', plazo: '2026-12-02', mismoQue: pasoId },
    });
    expect(r2).toMatchObject({ accion: 'recordado', paso: { id: pasoId, plazo: '2026-12-02' } });
    expect(await new ListarPasos(c).ejecutar()).toHaveLength(1);
  });

  it('R20: «recibimos tu test» con confianza alta lo cierra; con baja deja la sugerencia', async () => {
    const { c } = contextoDePrueba();
    const p = await postulada(c);
    const r = await new RecibirSenal(c).ejecutar({ ...TEST, postulacionId: p.id });
    const pasoId = r.destino === 'postulacion' ? r.paso!.id : '';
    const gracias = {
      ...TEST,
      estadoSugerido: undefined,
      paso: undefined,
      postulacionId: p.id,
      resumen: 'Gracias por completar la evaluación',
    };
    const baja = await new RecibirSenal(c).ejecutar({
      ...gracias,
      referenciaExterna: '<gracias1@x>',
      pasosCumplidos: [{ id: pasoId, confianza: 0.6 }],
    });
    expect(baja).toMatchObject({ sugeridos: [pasoId], cerrados: [] });
    const alta = await new RecibirSenal(c).ejecutar({
      ...gracias,
      referenciaExterna: '<gracias2@x>',
      pasosCumplidos: [{ id: pasoId, confianza: 0.93 }],
    });
    expect(alta).toMatchObject({ cerrados: [pasoId] });
    const [paso] = await new ListarPasos(c).ejecutar();
    expect(paso).toMatchObject({
      estado: 'hecho',
      cierre: { por: 'correo', referenciaExterna: '<gracias2@x>' },
    });
  });

  it('R20: un correo no puede cerrar el paso de otra postulación', async () => {
    const { c } = contextoDePrueba();
    const a = await postulada(c);
    const b = await postulada(c, { ...AVISO, url: 'https://ejemplo.test/b' });
    const r = await new RecibirSenal(c).ejecutar({ ...TEST, postulacionId: a.id });
    const pasoId = r.destino === 'postulacion' ? r.paso!.id : '';
    const x = await new RecibirSenal(c).ejecutar({
      ...TEST,
      paso: undefined,
      postulacionId: b.id,
      referenciaExterna: '<otro@x>',
      pasosCumplidos: [{ id: pasoId, confianza: 0.99 }],
    });
    expect(x).toMatchObject({ cerrados: [] });
  });

  it('sin postulación el paso queda propuesto en la bandeja y se crea al asociar a varias', async () => {
    const { c, bandeja } = contextoDePrueba();
    const a = await postulada(c);
    const b = await postulada(c, { ...AVISO, url: 'https://ejemplo.test/b' });
    const r = await new RecibirSenal(c).ejecutar({ ...TEST, candidatas: [a.id, b.id] });
    expect(r).toMatchObject({
      destino: 'bandeja',
      pendiente: {
        candidatas: [a.id, b.id],
        pasoPropuesto: { descripcion: 'Completar el test de personalidad' },
      },
    });
    expect(bandeja.eventos).toEqual(['senal.sin_asociar']);
    const id = r.destino === 'bandeja' ? r.pendiente.id : '';
    await new AsociarSenal(c).ejecutar({ senalId: id, postulacionIds: [a.id, b.id] });
    const [paso] = await new ListarPasos(c).ejecutar();
    expect(paso?.postulacionIds.sort()).toEqual([a.id, b.id].sort());
    expect((await new VerPostulacion(c).ejecutar(b.id)).senales).toHaveLength(1);
  });

  it('registrar a mano o por MCP: pendiente o ya hecho, idempotente por referencia; postulación inexistente da NO_ENCONTRADO', async () => {
    const { c } = contextoDePrueba();
    const p = await postulada(c);
    const cv = await new RegistrarPaso(c).ejecutar({
      postulacionIds: [p.id],
      descripcion: 'Contestar a Daniel con tu CV',
      detalle: 'Responde su mensaje en LinkedIn adjuntando tu CV en PDF',
      fuente: 'linkedin',
      registradoPor: 'ia',
      contactoRedId: '01a20b4b-6ae5-71b5-8680-6352f0b5399c',
      referenciaExterna: 'linkedin:msg:1',
    });
    expect(cv).toMatchObject({ estado: 'pendiente', fuente: 'linkedin', yaEstaba: false });
    const otra = await new RegistrarPaso(c).ejecutar({
      postulacionIds: [p.id],
      descripcion: 'Contestar a Daniel con tu CV',
      registradoPor: 'ia',
      referenciaExterna: 'linkedin:msg:1',
    });
    expect(otra).toMatchObject({ id: cv.id, yaEstaba: true });
    const hecho = await new RegistrarPaso(c).ejecutar({
      postulacionIds: [p.id],
      descripcion: 'Llenar el formulario de postulación',
      estado: 'hecho',
      fuente: 'portal',
      registradoPor: 'ia',
    });
    expect(hecho).toMatchObject({ estado: 'hecho', cierre: { por: 'ia' } });
    await expect(
      new RegistrarPaso(c).ejecutar({
        postulacionIds: ['01a209db-0000-7000-8000-000000000000'],
        descripcion: 'Algo por hacer',
        registradoPor: 'persona',
      }),
    ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('resolver y editar con versión: hecho por la persona, reabrir, y CONFLICTO con versión vieja', async () => {
    const { c } = contextoDePrueba();
    const p = await postulada(c);
    const paso = await new RegistrarPaso(c).ejecutar({
      postulacionIds: [p.id],
      descripcion: 'Mandar documentos',
      registradoPor: 'persona',
    });
    const hecho = await new ResolverPaso(c).ejecutar({
      id: paso.id,
      estado: 'hecho',
      por: 'persona',
      version: 0,
    });
    expect(hecho).toMatchObject({ estado: 'hecho', version: 1, cierre: { por: 'persona' } });
    await expect(
      new ResolverPaso(c).ejecutar({ id: paso.id, estado: 'pendiente', por: 'persona', version: 0 }),
    ).rejects.toMatchObject({ codigo: 'CONFLICTO' });
    await new ResolverPaso(c).ejecutar({ id: paso.id, estado: 'pendiente', por: 'ia' });
    const editado = await new EditarPaso(c).ejecutar({
      id: paso.id,
      version: 2,
      descripcion: 'Mandar el certificado de título',
      plazo: '2026-12-01',
    });
    expect(editado).toMatchObject({ descripcion: 'Mandar el certificado de título', plazo: '2026-12-01' });
    await expect(
      new ResolverPaso(c).ejecutar({ id: 'no', estado: 'hecho', por: 'ia' }),
    ).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
  });

  it('R17: cerrar no descarta los pasos, salvo que se pida; los que tocan otra abierta siguen', async () => {
    const { c } = contextoDePrueba();
    const a = await postulada(c);
    const b = await postulada(c, { ...AVISO, url: 'https://ejemplo.test/b' });
    const solo = await new RegistrarPaso(c).ejecutar({
      postulacionIds: [a.id],
      descripcion: 'Completar el test',
      registradoPor: 'vigia',
      fuente: 'correo',
    });
    const compartido = await new RegistrarPaso(c).ejecutar({
      postulacionIds: [a.id, b.id],
      descripcion: 'Completar el perfil del ATS',
      registradoPor: 'vigia',
      fuente: 'correo',
    });
    await new CambiarEstado(c).ejecutar({
      id: a.id,
      a: 'rechazado',
      motivo: 'Puesto ocupado',
      origen: 'tablero',
      version: a.version,
    });
    expect((await new ListarPasos(c).ejecutar({ estado: 'pendiente' })).length).toBe(2);

    const c2 = await postulada(c, { ...AVISO, url: 'https://ejemplo.test/c' });
    const otro = await new RegistrarPaso(c).ejecutar({
      postulacionIds: [c2.id],
      descripcion: 'Agendar la llamada',
      registradoPor: 'persona',
    });
    const cerrada = await new CambiarEstado(c).ejecutar({
      id: c2.id,
      a: 'descartado',
      motivo: 'No me interesa',
      origen: 'tablero',
      version: c2.version,
      descartarPasos: true,
    });
    expect(cerrada.pasos[0]).toMatchObject({
      id: otro.id,
      estado: 'descartado',
      cierre: { por: 'persona', nota: 'La postulación se cerró' },
    });
    const pendientes = (await new ListarPasos(c).ejecutar({ estado: 'pendiente' })).map((x) => x.id).sort();
    expect(pendientes).toEqual([solo.id, compartido.id].sort());
  });

  it('listar_postulaciones encuentra la postulación por la URL o el número del aviso', async () => {
    const { c } = contextoDePrueba();
    const p = await postulada(c);
    await postulada(c, { ...AVISO, url: 'https://ejemplo.test/39164530' });
    const porNumero = await new ListarPostulaciones(c).ejecutar({ url: '#3916453' });
    expect(porNumero.items.map((x) => x.id)).toEqual([p.id]);
    const porUrl = await new ListarPostulaciones(c).ejecutar({ url: LANEK.url });
    expect(porUrl.total).toBe(1);
  });
});
