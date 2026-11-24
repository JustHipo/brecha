import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { vaciar, prismaDePrueba } from '../../../compartido/infraestructura/base-de-pruebas.prueba';
import { depsDePrueba } from '../../../compartido/dominio/pruebas.prueba';
import { GeneradorUuidV7 } from '../../../compartido/infraestructura/reloj-y-ids';
import { ConflictoDeVersion, PostulacionDuplicada, SenalDuplicada } from '../../dominio/errores';
import { AVISO } from '../../dominio/fabrica.prueba';
import { Postulacion } from '../../dominio/postulacion';
import { PrismaPostulacionRepositorio } from './prisma-postulacion.repositorio';
import type { EventoGuardado } from '../outbox/outbox';

const prisma = prismaDePrueba();
const publicados: EventoGuardado[] = [];
const repo = new PrismaPostulacionRepositorio(prisma, new GeneradorUuidV7(), {
  publicar: (e) => publicados.push(...e),
});
const SEGURAS = { aplicarSeguras: false, umbral: 0.9 };

function deps() {
  const d = depsDePrueba(new Date('2026-11-23T12:00:00Z'));
  return { ...d, ids: new GeneradorUuidV7() };
}

beforeEach(async () => {
  await vaciar(prisma);
  publicados.length = 0;
});
afterAll(() => prisma.$disconnect());

describe('PrismaPostulacionRepositorio', () => {
  it('guardar y leer da el mismo agregado, con señales y discrepancias, y deja los eventos en outbox', async () => {
    const d = deps();
    const p = Postulacion.crear(
      {
        aviso: { ...AVISO, cierre: '2026-12-10' },
        sueldoPretendido: { monto: 1_700_000, moneda: 'CLP', periodo: 'mes', base: 'liquido' },
        origen: 'formulario',
      },
      d,
    );
    p.cambiarEstado(
      'postulado',
      {
        fechaPostulacion: '2026-11-20',
        canal: { tipo: 'portal', valor: 'Get on Board' },
        origen: 'formulario',
      },
      d,
    );
    p.cambiarEstado('entrevista', { origen: 'tablero' }, d);
    p.registrarSenal(
      {
        fuente: 'correo',
        resumen: 'No continuaremos',
        estadoSugerido: 'rechazado',
        confianza: 0.92,
        referenciaExterna: '<a@correo>',
      },
      { ...d, ...SEGURAS },
    );
    p.agregarNota('Preguntar por el stack', d);
    p.agregarContacto({ nombre: 'Persona Reclutadora', email: 'rrhh@ejemplo.test' }, d);
    p.agendarEntrevista(
      { fecha: new Date('2026-11-26T14:00:00Z'), tipo: 'tecnica', con: 'Equipo', origen: 'formulario' },
      d,
    );
    const antes = p.datos();

    await repo.guardar(p);
    const leida = await repo.porId(p.id);

    expect(leida?.datos()).toEqual({ ...antes, version: 0 });
    expect(leida?.datos().discrepancias.length).toBeGreaterThan(0);
    const outbox = await prisma.outbox.findMany({ orderBy: { ocurridoEn: 'asc' } });
    expect(outbox.map((o) => o.tipo)).toContain('postulacion.creada');
    expect(outbox.map((o) => o.tipo)).toContain('postulacion.discrepancia_detectada');
    expect(publicados).toHaveLength(outbox.length);
  });

  it('los cambios posteriores suben la versión y guardan solo lo nuevo o editado', async () => {
    const d = deps();
    const p = Postulacion.crear({ aviso: AVISO, origen: 'formulario' }, d);
    await repo.guardar(p);

    const a = (await repo.porId(p.id))!;
    const s = a.registrarSenal(
      { fuente: 'manual', resumen: 'Revisar', estadoSugerido: 'por_postular', confianza: 0.6 },
      { ...d, ...SEGURAS },
    );
    await repo.guardar(a);
    expect(a.version).toBe(1);

    const b = (await repo.porId(p.id))!;
    b.aplicarSenal(s.id, d);
    await repo.guardar(b);
    const c = (await repo.porId(p.id))!;
    expect(c.version).toBe(2);
    expect(c.estado).toBe('por_postular');
    expect(c.datos().senales[0]?.aplicada).toBe(true);
    expect(c.datos().historial).toHaveLength(2);
  });

  it('R10: el segundo guardado con la misma versión da CONFLICTO', async () => {
    const d = deps();
    const p = Postulacion.crear({ aviso: AVISO, origen: 'formulario' }, d);
    await repo.guardar(p);
    const uno = (await repo.porId(p.id))!;
    const dos = (await repo.porId(p.id))!;
    uno.agregarNota('primera', d);
    dos.agregarNota('segunda', d);
    await repo.guardar(uno);
    await expect(repo.guardar(dos)).rejects.toBeInstanceOf(ConflictoDeVersion);
    expect(await prisma.nota.count()).toBe(1);
  });

  it('R4: una sola postulación no terminal por aviso; una terminal libera la URL', async () => {
    const d = deps();
    const p = Postulacion.crear({ aviso: AVISO, origen: 'formulario' }, d);
    await repo.guardar(p);
    const otra = Postulacion.crear({ aviso: AVISO, origen: 'formulario' }, d);
    const error = await repo.guardar(otra).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PostulacionDuplicada);
    expect((error as PostulacionDuplicada).existenteId).toBe(p.id);

    const cargada = (await repo.porId(p.id))!;
    cargada.cambiarEstado(
      'postulado',
      { fechaPostulacion: '2026-11-20', canal: { tipo: 'portal', valor: 'x' }, origen: 'formulario' },
      d,
    );
    cargada.cambiarEstado('rechazado', { motivo: 'No siguieron', origen: 'formulario' }, d);
    await repo.guardar(cargada);
    await repo.guardar(Postulacion.crear({ aviso: AVISO, origen: 'formulario' }, d));
    expect(await prisma.postulacion.count()).toBe(2);
  });

  it('una referencia externa repetida en otra postulación da YA_EXISTE', async () => {
    const d = deps();
    const a = Postulacion.crear({ aviso: AVISO, origen: 'formulario' }, d);
    a.registrarSenal(
      { fuente: 'correo', resumen: 'x', confianza: 0.5, referenciaExterna: '<mismo@id>' },
      { ...d, ...SEGURAS },
    );
    await repo.guardar(a);
    const b = Postulacion.crear(
      { aviso: { ...AVISO, url: 'https://ejemplo.test/otro' }, origen: 'formulario' },
      d,
    );
    b.registrarSenal(
      { fuente: 'correo', resumen: 'x', confianza: 0.5, referenciaExterna: '<mismo@id>' },
      { ...d, ...SEGURAS },
    );
    await expect(repo.guardar(b)).rejects.toBeInstanceOf(SenalDuplicada);
  });

  it('porId con un id que no existe o mal formado da null', async () => {
    expect(await repo.porId('00000000-0000-7000-8000-000000000000')).toBeNull();
    expect(await repo.porId('no-es-uuid')).toBeNull();
  });

  it('guarda y lee etiquetas, prioridad fijada y el aviso con stack, requisitos y sueldo publicado', async () => {
    const d = deps();
    const p = Postulacion.crear(
      {
        aviso: {
          ...AVISO,
          stack: ['Python', 'MATLAB'],
          requisitos: 'Inglés',
          sueldoPublicado: 'CLP 150.000',
        },
        etiquetas: ['investigacion'],
        prioridadFijada: 'alta',
        origen: 'importacion',
      },
      d,
    );
    await repo.guardar(p);
    const leida = await repo.porId(p.id);
    expect(leida!.datos()).toMatchObject({
      etiquetas: ['investigacion'],
      prioridadFijada: 'alta',
      aviso: { stack: ['Python', 'MATLAB'], requisitos: 'Inglés', sueldoPublicado: 'CLP 150.000' },
    });
    leida!.editar({ etiquetas: [], prioridad: null, stack: [] }, d.reloj);
    await repo.guardar(leida!);
    const otra = (await repo.porId(p.id))!.datos();
    expect(otra.etiquetas).toEqual([]);
    expect(otra.prioridadFijada).toBeUndefined();
    expect(otra.aviso.stack).toBeUndefined();
  });
});
