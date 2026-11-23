import { describe, expect, it } from 'vitest';
import { AVISO } from '../dominio/fabrica.prueba';
import {
  AgendarEntrevista,
  AgregarContacto,
  AgregarNota,
  AplicarSenal,
  CambiarEstado,
  CrearPostulacion,
  EditarPostulacion,
  RegistrarResultadoEntrevista,
  RegistrarSenal,
  ResolverDiscrepancia,
} from './casos-de-escritura';
import { Exportar, ListarPostulaciones, ResumenDesde, VerPostulacion, VerTablero } from './casos-de-lectura';
import { contextoDePrueba } from './en-memoria.prueba';

const CANAL = { tipo: 'portal', valor: 'Get on Board' };

async function crear(c: ReturnType<typeof contextoDePrueba>['c'], extra: object = {}) {
  return new CrearPostulacion(c).ejecutar({ aviso: { ...AVISO }, origen: 'formulario', ...extra });
}

describe('casos de uso con repositorio en memoria y reloj fijo', () => {
  it('crear devuelve el detalle y deja el evento', async () => {
    const { c, repo } = contextoDePrueba();
    const d = await crear(c);
    expect(d).toMatchObject({
      estado: 'sin_decidir',
      prioridad: 'media',
      version: 0,
      transicionesPosibles: ['por_postular', 'postulado', 'descartado'],
    });
    expect(repo.outbox).toEqual(['postulacion.creada']);
  });

  it('R4: el mismo aviso dos veces da YA_EXISTE con el id de la existente', async () => {
    const { c } = contextoDePrueba();
    const d = await crear(c);
    await expect(crear(c)).rejects.toMatchObject({ codigo: 'YA_EXISTE', existenteId: d.id });
  });

  it('R3: con reloj fijo, postular a un aviso que cerró ayer da AVISO_CERRADO', async () => {
    const { c } = contextoDePrueba(new Date('2026-11-23T12:00:00Z'));
    const d = await new CrearPostulacion(c).ejecutar({
      aviso: { ...AVISO, cierre: '2026-11-22' },
      origen: 'formulario',
    });
    expect(d.transicionesPosibles).not.toContain('postulado');
    await expect(
      new CambiarEstado(c).ejecutar({
        id: d.id,
        a: 'postulado',
        fechaPostulacion: '2026-11-23',
        canal: CANAL,
        origen: 'formulario',
        version: 0,
      }),
    ).rejects.toMatchObject({ codigo: 'AVISO_CERRADO' });
  });

  it('cambiar estado exige la versión y da CONFLICTO si no coincide', async () => {
    const { c } = contextoDePrueba();
    const d = await crear(c);
    await expect(
      new CambiarEstado(c).ejecutar({ id: d.id, a: 'por_postular', origen: 'tablero' }),
    ).rejects.toMatchObject({ codigo: 'VALIDACION', campo: 'version' });
    await expect(
      new CambiarEstado(c).ejecutar({ id: d.id, a: 'por_postular', origen: 'tablero', version: 7 }),
    ).rejects.toMatchObject({ codigo: 'CONFLICTO' });
    const r = await new CambiarEstado(c).ejecutar({
      id: d.id,
      a: 'por_postular',
      origen: 'tablero',
      version: 0,
    });
    expect(r).toMatchObject({ estado: 'por_postular', version: 1 });
  });

  it('la IA puede mover sin versión y queda con origen ia', async () => {
    const { c } = contextoDePrueba();
    const d = await crear(c);
    const r = await new CambiarEstado(c).ejecutar({ id: d.id, a: 'por_postular', origen: 'ia' });
    expect(r.historial[0]).toMatchObject({ a: 'por_postular', origen: 'ia' });
  });

  it('una id que no existe da NO_ENCONTRADO', async () => {
    const { c } = contextoDePrueba();
    await expect(new AgregarNota(c).ejecutar({ id: 'nada', texto: 'x' })).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
    await expect(new VerPostulacion(c).ejecutar('nada')).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('una señal repetida no se duplica', async () => {
    const { c, repo } = contextoDePrueba();
    const d = await crear(c);
    const senal = {
      id: d.id,
      fuente: 'correo' as const,
      resumen: 'Recibimos tu postulación',
      confianza: 0.8,
      referenciaExterna: '<x@y>',
    };
    await new RegistrarSenal(c).ejecutar(senal);
    await expect(new RegistrarSenal(c).ejecutar(senal)).rejects.toMatchObject({ codigo: 'YA_EXISTE' });
    expect(repo.filas.get(d.id)?.senales).toHaveLength(1);
  });

  it('flujo de F1-14: postular, señal de rechazo, discrepancia y corrección', async () => {
    const { c } = contextoDePrueba();
    let d = await crear(c);
    d = await new CambiarEstado(c).ejecutar({
      id: d.id,
      a: 'postulado',
      fechaPostulacion: '2026-11-23',
      canal: CANAL,
      origen: 'formulario',
      version: d.version,
    });
    const { postulacion } = await new RegistrarSenal(c).ejecutar({
      id: d.id,
      fuente: 'manual',
      resumen: 'No continuaremos',
      estadoSugerido: 'rechazado',
      confianza: 0.9,
    });
    expect(postulacion.discrepanciasAbiertas).toBe(1);
    const disc = postulacion.discrepancias[0]!;
    d = await new ResolverDiscrepancia(c).ejecutar({
      id: d.id,
      discrepanciaId: disc.id,
      decision: 'corregir',
      a: 'rechazado',
      motivo: 'Llegó el rechazo',
      version: postulacion.version,
    });
    expect(d).toMatchObject({ estado: 'rechazado', prioridad: 'baja', discrepanciasAbiertas: 0 });
  });

  it('aplicar señales seguras según los ajustes', async () => {
    const { c, ajustes } = contextoDePrueba();
    ajustes.seguras = true;
    const d = await crear(c, { estado: 'postulado', fechaPostulacion: '2026-11-20', canal: CANAL });
    const { senal, postulacion } = await new RegistrarSenal(c).ejecutar({
      id: d.id,
      fuente: 'correo',
      resumen: 'No continuaremos',
      estadoSugerido: 'rechazado',
      confianza: 0.95,
    });
    expect(senal.aplicada).toBe(true);
    expect(postulacion.estado).toBe('rechazado');
  });

  it('aplicar una señal a mano, notas, contactos, entrevistas y edición', async () => {
    const { c } = contextoDePrueba();
    let d = await crear(c, { estado: 'postulado', fechaPostulacion: '2026-11-20', canal: CANAL });
    const { senal } = await new RegistrarSenal(c).ejecutar({
      id: d.id,
      fuente: 'correo',
      resumen: 'Pasaste a revisión',
      estadoSugerido: 'en_proceso',
      confianza: 0.7,
    });
    d = await new AplicarSenal(c).ejecutar({ id: d.id, senalId: senal.id });
    expect(d.estado).toBe('en_proceso');
    d = await new AgregarNota(c).ejecutar({ id: d.id, texto: 'Preparar caso' });
    d = await new AgregarContacto(c).ejecutar({ id: d.id, nombre: 'Persona', email: 'p@ejemplo.test' });
    d = await new AgendarEntrevista(c).ejecutar({
      id: d.id,
      fecha: '2026-11-26T14:00:00Z',
      tipo: 'tecnica',
      origen: 'formulario',
    });
    expect(d.estado).toBe('entrevista');
    await expect(
      new AgendarEntrevista(c).ejecutar({ id: d.id, fecha: 'mañana', tipo: 'tecnica', origen: 'formulario' }),
    ).rejects.toMatchObject({ codigo: 'VALIDACION' });
    d = await new RegistrarResultadoEntrevista(c).ejecutar({
      id: d.id,
      entrevistaId: d.entrevistas[0]!.id,
      resultado: 'avanza',
    });
    d = await new EditarPostulacion(c).ejecutar({
      id: d.id,
      version: d.version,
      sueldoPretendido: { monto: 2500, moneda: 'USD' },
      cierre: '2026-12-01',
    });
    expect(d).toMatchObject({
      notas: [{ texto: 'Preparar caso' }],
      sueldoPretendido: { monto: 2500, moneda: 'USD', periodo: 'mes' },
      cierre: '2026-12-01',
    });
    d = await new EditarPostulacion(c).ejecutar({
      id: d.id,
      version: d.version,
      sueldoPretendido: null,
      cierre: null,
      canal: { tipo: 'email', valor: 'rrhh@ejemplo.test' },
    });
    expect(d).toMatchObject({ sueldoPretendido: null, cierre: null, canal: { tipo: 'email' } });
  });

  it('listar valida filtros y pagina; tablero ordena por prioridad', async () => {
    const { c } = contextoDePrueba();
    await crear(c);
    await new CrearPostulacion(c).ejecutar({
      aviso: { ...AVISO, url: 'https://ejemplo.test/2', cierre: '2026-11-24', empresa: 'Otra' },
      origen: 'formulario',
    });
    const listar = new ListarPostulaciones(c);
    await expect(listar.ejecutar({ estados: ['inventado'] })).rejects.toMatchObject({
      codigo: 'VALIDACION',
      campo: 'estado',
    });
    await expect(listar.ejecutar({ plataformas: ['myspace'] })).rejects.toMatchObject({
      campo: 'plataforma',
    });
    await expect(listar.ejecutar({ prioridades: ['urgente'] })).rejects.toMatchObject({ campo: 'prioridad' });
    await expect(listar.ejecutar({ limit: 0 })).rejects.toMatchObject({ campo: 'limit' });
    await expect(listar.ejecutar({ offset: -1 })).rejects.toMatchObject({ campo: 'offset' });
    expect((await listar.ejecutar({ q: 'otra' })).total).toBe(1);
    expect(
      (
        await listar.ejecutar({
          prioridades: ['alta'],
          estados: ['sin_decidir'],
          plataformas: ['getonboard'],
        })
      ).total,
    ).toBe(1);
    const t = await new VerTablero(c).ejecutar();
    expect(t.columnas[0]?.items.map((i) => i.empresa)).toEqual(['Otra', 'Empresa Ficticia']);
    const x = await new Exportar(c).ejecutar();
    expect(x.conteos.porPrioridad).toEqual({ alta: 1, media: 1, baja: 0 });
    await expect(new ResumenDesde(c).ejecutar('no-fecha')).rejects.toMatchObject({ codigo: 'VALIDACION' });
    expect(await new ResumenDesde(c).ejecutar()).toEqual([]);
  });
});
