import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fichasDesdeArtifact,
  modalidadDesdeTexto,
  plataformaDesdeUrl,
} from '../infraestructura/importacion/desde-artifact';
import { contextoDePrueba } from './en-memoria.prueba';
import { ImportarFichas } from './importar-fichas';

const ejemplo = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../../datos/ejemplo/artifact-export.json'), 'utf8'),
);

describe('importar fichas (F1-11)', () => {
  it('traduce el export: estado guardado manda, plataforma, modalidad, canal y nota', () => {
    const f = fichasDesdeArtifact(ejemplo);
    expect(f).toHaveLength(5);
    const kora = f.find((x) => x.aviso.url.endsWith('kora-fullstack'))!;
    expect(kora).toMatchObject({
      estado: 'en_proceso',
      fechaPostulacion: '2026-11-10',
      canal: { tipo: 'portal', valor: 'LinkedIn' },
      aviso: { plataforma: 'linkedin', modalidad: 'hibrido' },
      nota: 'Respondieron por correo: pasa a revisión técnica.',
    });
    const sur = f.find((x) => x.aviso.url.endsWith('sur-python'))!;
    expect(sur).toMatchObject({
      estado: 'rechazado',
      aviso: { plataforma: 'sitio_empresa', empresa: 'Sur Tecnología (ficticia)' },
      motivo: expect.any(String),
    });
    expect(f.find((x) => x.aviso.url.endsWith('quantix-ia'))).toMatchObject({
      estado: 'descartado',
      aviso: { plataforma: 'sitio_empresa' },
    });
    expect(f.find((x) => x.aviso.url.endsWith('quantix-ia'))?.canal).toBeUndefined();
  });

  it('importar dos veces no duplica y deja el estado del export', async () => {
    const { c, repo } = contextoDePrueba();
    const caso = new ImportarFichas(c);
    const fichas = fichasDesdeArtifact(ejemplo);
    expect(await caso.ejecutar(fichas)).toEqual({ creadas: 5, omitidas: 0, errores: [] });
    expect(await caso.ejecutar(fichas)).toEqual({ creadas: 0, omitidas: 5, errores: [] });
    expect(repo.filas.size).toBe(5);
    const estados = [...repo.filas.values()].map((d) => [d.aviso.empresa, d.estado, d.historial[0]?.origen]);
    expect(estados).toContainEqual(['Kora Software (ficticia)', 'en_proceso', 'importacion']);
    expect([...repo.filas.values()].find((d) => d.estado === 'en_proceso')?.notas).toHaveLength(1);
  });

  it('una ficha mala se informa sin cortar las demás', async () => {
    const { c } = contextoDePrueba();
    const r = await new ImportarFichas(c).ejecutar([
      {
        aviso: { titulo: '', empresa: 'X', url: 'https://ejemplo.test/x', plataforma: 'otra' },
        estado: 'sin_decidir',
      },
      {
        aviso: { titulo: 'T', empresa: 'Y', url: 'https://ejemplo.test/y', plataforma: 'otra' },
        estado: 'sin_decidir',
      },
    ]);
    expect(r.creadas).toBe(1);
    expect(r.errores[0]).toMatchObject({ codigo: 'VALIDACION', campo: 'aviso.titulo' });
  });

  it('ayudas de traducción', () => {
    expect(plataformaDesdeUrl('https://www.linkedin.com/jobs/view/1')).toBe('linkedin');
    expect(plataformaDesdeUrl('https://www.chiletrabajos.cl/x')).toBe('chiletrabajos');
    expect(plataformaDesdeUrl('no-url')).toBe('otra');
    expect(modalidadDesdeTexto('Híbrido flexible')).toBe('hibrido');
    expect(modalidadDesdeTexto(undefined)).toBe('no_indica');
    expect(() => fichasDesdeArtifact({} as never)).toThrow();
  });
});
