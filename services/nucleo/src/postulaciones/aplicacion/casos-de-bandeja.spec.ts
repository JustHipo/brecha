import { describe, expect, it } from 'vitest';
import { AVISO } from '../dominio/fabrica.prueba';
import {
  AsociarSenal,
  CrearDesdeSenal,
  DescartarSenal,
  ListarBandeja,
  RecibirSenal,
} from './casos-de-bandeja';
import { CrearPostulacion, RegistrarSenal, VincularAviso } from './casos-de-escritura';
import { contextoDePrueba } from './en-memoria.prueba';

const SENAL = {
  fuente: 'correo' as const,
  resumen: 'Agendemos una entrevista',
  estadoSugerido: 'entrevista' as const,
  confianza: 0.7,
};

describe('casos de la Bandeja', () => {
  it('sin postulación la señal va a la bandeja y deja su evento', async () => {
    const { c, bandeja } = contextoDePrueba();
    const r = await new RecibirSenal(c).ejecutar({
      ...SENAL,
      referenciaExterna: '<1@x>',
      empresaDetectada: 'Ficticia',
    });
    expect(r).toMatchObject({
      destino: 'bandeja',
      pendiente: { estado: 'pendiente', empresaDetectada: 'Ficticia' },
    });
    expect(bandeja.eventos).toEqual(['senal.sin_asociar']);
    expect(await new ListarBandeja(c).ejecutar()).toHaveLength(1);
  });

  it('con postulación se registra en ella; una referencia ya usada en la bandeja da YA_EXISTE', async () => {
    const { c } = contextoDePrueba();
    const p = await new CrearPostulacion(c).ejecutar({
      aviso: AVISO,
      estado: 'postulado',
      fechaPostulacion: '2026-11-20',
      canal: { tipo: 'portal', valor: 'x' },
      origen: 'formulario',
    });
    const r = await new RecibirSenal(c).ejecutar({ ...SENAL, postulacionId: p.id });
    expect(r.destino).toBe('postulacion');
    await new RecibirSenal(c).ejecutar({ ...SENAL, referenciaExterna: '<dup@x>' });
    await expect(
      new RegistrarSenal(c).ejecutar({ id: p.id, ...SENAL, referenciaExterna: '<dup@x>' }),
    ).rejects.toMatchObject({ codigo: 'YA_EXISTE' });
    await expect(
      new RecibirSenal(c).ejecutar({ ...SENAL, referenciaExterna: '<dup@x>' }),
    ).rejects.toMatchObject({ codigo: 'YA_EXISTE' });
  });

  it('asociar mueve la señal a la postulación y la saca de la bandeja; con D27 una entrevista segura se aplica', async () => {
    const { c, ajustes } = contextoDePrueba();
    ajustes.seguras = true;
    const p = await new CrearPostulacion(c).ejecutar({
      aviso: AVISO,
      estado: 'postulado',
      fechaPostulacion: '2026-11-20',
      canal: { tipo: 'portal', valor: 'x' },
      origen: 'formulario',
    });
    const r = await new RecibirSenal(c).ejecutar({ ...SENAL, confianza: 0.95, referenciaExterna: '<2@x>' });
    if (r.destino !== 'bandeja') throw new Error('esperaba bandeja');
    const d = await new AsociarSenal(c).ejecutar({ senalId: r.pendiente.id, postulacionId: p.id });
    expect(d).toMatchObject({
      estado: 'entrevista',
      senales: [{ referenciaExterna: '<2@x>', aplicada: true }],
    });
    expect(await new ListarBandeja(c).ejecutar()).toHaveLength(0);
    await expect(
      new AsociarSenal(c).ejecutar({ senalId: r.pendiente.id, postulacionId: p.id }),
    ).rejects.toMatchObject({ codigo: 'VALIDACION' });
    await expect(
      new AsociarSenal(c).ejecutar({ senalId: 'nada', postulacionId: p.id }),
    ).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('crear desde la señal crea la postulación y la asocia; descartar la saca de la bandeja', async () => {
    const { c } = contextoDePrueba();
    const a = await new RecibirSenal(c).ejecutar({ ...SENAL, estadoSugerido: undefined });
    const b = await new RecibirSenal(c).ejecutar({ ...SENAL });
    if (a.destino !== 'bandeja' || b.destino !== 'bandeja') throw new Error('esperaba bandeja');
    const d = await new CrearDesdeSenal(c).ejecutar({
      senalId: a.pendiente.id,
      aviso: { ...AVISO, url: 'https://ejemplo.test/nueva' },
    });
    expect(d.senales).toHaveLength(1);
    expect((await new DescartarSenal(c).ejecutar(b.pendiente.id)).estado).toBe('descartada');
    expect(await new ListarBandeja(c).ejecutar()).toHaveLength(0);
    await expect(
      new CrearDesdeSenal(c).ejecutar({ senalId: b.pendiente.id, aviso: AVISO }),
    ).rejects.toMatchObject({ codigo: 'VALIDACION' });
  });

  it('vincular aviso deja avisoId y calce en la postulación', async () => {
    const { c } = contextoDePrueba();
    const p = await new CrearPostulacion(c).ejecutar({ aviso: AVISO, origen: 'formulario' });
    const d = await new VincularAviso(c).ejecutar({ id: p.id, avisoId: 'a-1', calce: 0.6 });
    expect(d.aviso).toMatchObject({ avisoId: 'a-1', calce: 0.6 });
  });
});
