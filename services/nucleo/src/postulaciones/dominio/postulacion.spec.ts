import { beforeEach, describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import {
  AvisoCerrado,
  DatoInvalido,
  EstadoTerminal,
  NoEncontrada,
  SenalDuplicada,
  TransicionInvalida,
} from './errores';
import { AVISO, enEstado } from './fabrica.prueba';
import { crearAvisoResumen } from './objetos-valor/valores';
import { Postulacion, type PostulacionDatos } from './postulacion';

const CANAL = { tipo: 'portal', valor: 'LinkedIn' } as const;
const SEGURAS = { aplicarSeguras: false, umbral: 0.9 };

let deps: ReturnType<typeof depsDePrueba>;
beforeEach(() => {
  deps = depsDePrueba(new Date('2026-11-23T12:00:00Z'));
});

function tipos(p: Postulacion) {
  return p.sacarEventos().map((e) => e.tipo);
}

describe('crear', () => {
  it('parte en sin_decidir, registra el cambio inicial y el evento', () => {
    const p = Postulacion.crear({ aviso: AVISO, origen: 'formulario' }, deps);
    expect(p.estado).toBe('sin_decidir');
    expect(p.datos().historial).toHaveLength(1);
    expect(p.cambiosPendientes().creada).toBe(true);
    const [ev] = p.sacarEventos();
    expect(ev).toMatchObject({ tipo: 'postulacion.creada', prioridad: 'media', version: 1 });
  });

  it('no parte en un estado avanzado salvo al importar', () => {
    expect(() =>
      Postulacion.crear({ aviso: AVISO, estado: 'entrevista', origen: 'formulario' }, deps),
    ).toThrow(TransicionInvalida);
    const p = Postulacion.crear({ aviso: AVISO, estado: 'entrevista', origen: 'importacion' }, deps);
    expect(p.estado).toBe('entrevista');
  });

  it('importar como postulado no exige fecha ni canal', () => {
    const p = Postulacion.crear({ aviso: AVISO, estado: 'postulado', origen: 'importacion' }, deps);
    expect(p.estado).toBe('postulado');
  });

  it('crear como postulado aplica R2', () => {
    expect(() =>
      Postulacion.crear({ aviso: AVISO, estado: 'postulado', origen: 'formulario' }, deps),
    ).toThrow(DatoInvalido);
    const p = Postulacion.crear(
      {
        aviso: AVISO,
        estado: 'postulado',
        fechaPostulacion: '2026-11-20',
        canal: CANAL,
        origen: 'formulario',
      },
      deps,
    );
    expect(p.datos().fechaPostulacion).toBe('2026-11-20');
  });

  it('crear como postulado con el aviso cerrado da AVISO_CERRADO (R3)', () => {
    const aviso = { ...AVISO, cierre: '2026-11-01' };
    expect(() =>
      Postulacion.crear(
        { aviso, estado: 'postulado', fechaPostulacion: '2026-11-20', canal: CANAL, origen: 'formulario' },
        deps,
      ),
    ).toThrow(AvisoCerrado);
  });

  it('rechaza un estado desconocido', () => {
    expect(() =>
      Postulacion.crear({ aviso: AVISO, estado: 'inventado' as never, origen: 'importacion' }, deps),
    ).toThrow(DatoInvalido);
  });
});

describe('R2: postular exige fecha y canal, y la fecha no puede ser futura', () => {
  it('pasa con fecha de hoy y canal', () => {
    const p = enEstado('sin_decidir', deps, { fechaPostulacion: undefined, canal: undefined });
    p.cambiarEstado(
      'postulado',
      { fechaPostulacion: '2026-11-23', canal: CANAL, origen: 'formulario' },
      deps,
    );
    expect(p.estado).toBe('postulado');
    expect(p.datos().canal).toEqual(CANAL);
  });

  it('falla sin fecha', () => {
    const p = enEstado('sin_decidir', deps, { fechaPostulacion: undefined, canal: undefined });
    expect(() => p.cambiarEstado('postulado', { canal: CANAL, origen: 'formulario' }, deps)).toThrow(
      expect.objectContaining({ codigo: 'VALIDACION', campo: 'fechaPostulacion' }),
    );
  });

  it('falla sin canal', () => {
    const p = enEstado('sin_decidir', deps, { fechaPostulacion: undefined, canal: undefined });
    expect(() =>
      p.cambiarEstado('postulado', { fechaPostulacion: '2026-11-20', origen: 'formulario' }, deps),
    ).toThrow(expect.objectContaining({ campo: 'canal' }));
  });

  it('falla con fecha futura', () => {
    const p = enEstado('sin_decidir', deps, { fechaPostulacion: undefined, canal: undefined });
    expect(() =>
      p.cambiarEstado(
        'postulado',
        { fechaPostulacion: '2026-11-24', canal: CANAL, origen: 'formulario' },
        deps,
      ),
    ).toThrow(expect.objectContaining({ campo: 'fechaPostulacion' }));
    expect(p.estado).toBe('sin_decidir');
  });

  it('falla con una fecha mal escrita', () => {
    const p = enEstado('sin_decidir', deps, { fechaPostulacion: undefined, canal: undefined });
    expect(() =>
      p.cambiarEstado(
        'postulado',
        { fechaPostulacion: '2026-02-30', canal: CANAL, origen: 'formulario' },
        deps,
      ),
    ).toThrow(DatoInvalido);
  });
});

describe('R3: no se postula a un aviso cerrado (con reloj fijo)', () => {
  it('pasa si cierra hoy', () => {
    const p = enEstado('sin_decidir', deps, { aviso: { ...AVISO, cierre: '2026-11-23' } });
    p.cambiarEstado('postulado', { origen: 'formulario' }, deps);
    expect(p.estado).toBe('postulado');
  });

  it('falla si cerró ayer', () => {
    const p = enEstado('sin_decidir', deps, { aviso: { ...AVISO, cierre: '2026-11-22' } });
    expect(() => p.cambiarEstado('postulado', { origen: 'formulario' }, deps)).toThrow(AvisoCerrado);
    expect(p.transicionesPosibles(deps.reloj)).not.toContain('postulado');
    expect(p.transicionesPosibles()).toContain('postulado');
  });
});

describe('R5: rechazado y descartado exigen motivo', () => {
  it('pasa con motivo', () => {
    const p = enEstado('postulado', deps);
    p.cambiarEstado('rechazado', { motivo: 'No siguieron', origen: 'formulario' }, deps);
    expect(p.datos().historial.at(-1)?.motivo).toBe('No siguieron');
  });

  it.each(['rechazado', 'descartado'] as const)('falla sin motivo hacia %s', (a) => {
    const p = enEstado('postulado', deps);
    expect(() => p.cambiarEstado(a, { motivo: '  ', origen: 'formulario' }, deps)).toThrow(
      expect.objectContaining({ campo: 'motivo' }),
    );
  });
});

describe('R6: reabrir solo si el aviso no cerró', () => {
  it('pasa sin cierre', () => {
    const p = enEstado('descartado', deps);
    p.cambiarEstado('sin_decidir', { origen: 'formulario' }, deps);
    expect(p.estado).toBe('sin_decidir');
  });

  it('falla con el aviso cerrado', () => {
    const p = enEstado('descartado', deps, { aviso: { ...AVISO, cierre: '2026-11-01' } });
    expect(() => p.cambiarEstado('sin_decidir', { origen: 'formulario' }, deps)).toThrow(AvisoCerrado);
    expect(p.transicionesPosibles(deps.reloj)).toEqual([]);
  });
});

describe('R7: agendar entrevista', () => {
  it('desde postulado mueve a entrevista y emite el evento', () => {
    const p = enEstado('postulado', deps);
    const e = p.agendarEntrevista(
      { fecha: new Date('2026-11-25T15:00:00Z'), tipo: 'tecnica', origen: 'formulario' },
      deps,
    );
    expect(p.estado).toBe('entrevista');
    expect(e.resultado).toBe('pendiente');
    expect(tipos(p)).toContain('postulacion.entrevista_agendada');
  });

  it('en entrevista no cambia de estado', () => {
    const p = enEstado('entrevista', deps);
    p.agendarEntrevista(
      { fecha: new Date('2026-11-25T15:00:00Z'), tipo: 'final', con: ' Ana ', origen: 'ia' },
      deps,
    );
    expect(p.datos().historial).toHaveLength(1);
    expect(p.datos().entrevistas[0]?.con).toBe('Ana');
  });

  it('falla desde sin_decidir', () => {
    const p = enEstado('sin_decidir', deps);
    expect(() =>
      p.agendarEntrevista(
        { fecha: new Date('2026-11-25T15:00:00Z'), tipo: 'rrhh', origen: 'formulario' },
        deps,
      ),
    ).toThrow(TransicionInvalida);
  });

  it('valida fecha y tipo', () => {
    const p = enEstado('postulado', deps);
    expect(() =>
      p.agendarEntrevista({ fecha: new Date('x'), tipo: 'rrhh', origen: 'formulario' }, deps),
    ).toThrow(DatoInvalido);
    expect(() =>
      p.agendarEntrevista({ fecha: new Date(), tipo: 'cafe' as never, origen: 'formulario' }, deps),
    ).toThrow(DatoInvalido);
  });

  it('registra el resultado', () => {
    const p = enEstado('entrevista', deps);
    const e = p.agendarEntrevista(
      { fecha: new Date('2026-11-25T15:00:00Z'), tipo: 'rrhh', origen: 'formulario' },
      deps,
    );
    p.marcarGuardada(4);
    p.registrarResultadoEntrevista(e.id, 'avanza', deps.reloj);
    expect(p.datos().entrevistas[0]?.resultado).toBe('avanza');
    expect(p.cambiosPendientes().modificados.has(e.id)).toBe(true);
    expect(() => p.registrarResultadoEntrevista('no-existe', 'avanza', deps.reloj)).toThrow(NoEncontrada);
    expect(() => p.registrarResultadoEntrevista(e.id, 'quizas' as never, deps.reloj)).toThrow(DatoInvalido);
  });
});

describe('R8: en estado terminal no se agregan entrevistas ni contactos; sí notas y señales', () => {
  it.each(['rechazado', 'aceptada'] as const)('en %s', (estado) => {
    const p = enEstado(estado, deps);
    expect(() => p.agregarContacto({ nombre: 'Ana', email: 'ana@ejemplo.test' }, deps)).toThrow(
      EstadoTerminal,
    );
    expect(() =>
      p.agendarEntrevista({ fecha: new Date(), tipo: 'rrhh', origen: 'formulario' }, deps),
    ).toThrow(EstadoTerminal);
    p.agregarNota('Sigue siendo útil anotar', deps);
    p.registrarSenal(
      { fuente: 'correo', resumen: 'Correo de seguimiento', confianza: 0.5 },
      { ...deps, ...SEGURAS },
    );
    expect(p.datos().notas).toHaveLength(1);
    expect(p.datos().senales).toHaveLength(1);
  });

  it('en un estado abierto sí se agrega un contacto válido', () => {
    const p = enEstado('postulado', deps);
    const c = p.agregarContacto(
      { nombre: 'Ana', rol: 'Reclutadora', linkedin: 'https://linkedin.test/ana' },
      deps,
    );
    expect(c.rol).toBe('Reclutadora');
    expect(() => p.agregarContacto({ nombre: 'Sin datos' }, deps)).toThrow(DatoInvalido);
    expect(() => p.agregarContacto({ nombre: 'Mal', email: 'no-es-correo' }, deps)).toThrow(DatoInvalido);
  });
});

describe('R9: notas', () => {
  it('se agregan con texto de 1 a 5000 caracteres', () => {
    const p = enEstado('postulado', deps);
    p.agregarNota('  hola  ', deps);
    expect(p.datos().notas[0]?.texto).toBe('hola');
    expect(() => p.agregarNota('', deps)).toThrow(DatoInvalido);
    expect(() => p.agregarNota('x'.repeat(5001), deps)).toThrow(DatoInvalido);
  });
});

describe('R11: una señal no cambia el estado por sí sola', () => {
  const rechazo = {
    fuente: 'correo' as const,
    resumen: 'No continuaremos',
    estadoSugerido: 'rechazado' as const,
    confianza: 0.95,
  };

  it('sin «aplicar señales seguras» queda como sugerencia', () => {
    const p = enEstado('postulado', deps);
    const s = p.registrarSenal(rechazo, { ...deps, ...SEGURAS });
    expect(s.aplicada).toBe(false);
    expect(p.estado).toBe('postulado');
    expect(tipos(p)).toContain('postulacion.senal_registrada');
  });

  it('con «aplicar señales seguras» y confianza alta se aplica sola', () => {
    const p = enEstado('postulado', deps);
    const s = p.registrarSenal(rechazo, { ...deps, aplicarSeguras: true, umbral: 0.9 });
    expect(s.aplicada).toBe(true);
    expect(p.estado).toBe('rechazado');
    expect(p.datos().historial.at(-1)?.origen).toBe('senal');
    expect(p.datos().discrepancias).toHaveLength(0);
  });

  it('con confianza bajo el umbral no se aplica', () => {
    const p = enEstado('postulado', deps);
    const s = p.registrarSenal(
      { ...rechazo, confianza: 0.5 },
      { ...deps, aplicarSeguras: true, umbral: 0.9 },
    );
    expect(s.aplicada).toBe(false);
  });

  it('una transición inválida queda como sugerencia', () => {
    const p = enEstado('sin_decidir', deps);
    const s = p.registrarSenal(
      { ...rechazo, estadoSugerido: 'oferta' },
      { ...deps, aplicarSeguras: true, umbral: 0.9 },
    );
    expect(s.aplicada).toBe(false);
    expect(p.estado).toBe('sin_decidir');
  });

  it('valida los datos de la señal', () => {
    const p = enEstado('postulado', deps);
    const ctx = { ...deps, ...SEGURAS };
    expect(() => p.registrarSenal({ ...rechazo, confianza: 1.2 }, ctx)).toThrow(DatoInvalido);
    expect(() => p.registrarSenal({ ...rechazo, resumen: '' }, ctx)).toThrow(DatoInvalido);
    expect(() => p.registrarSenal({ ...rechazo, fuente: 'paloma' as never }, ctx)).toThrow(DatoInvalido);
    expect(() => p.registrarSenal({ ...rechazo, estadoSugerido: 'x' as never }, ctx)).toThrow(DatoInvalido);
  });

  it('una referencia externa repetida no se duplica', () => {
    const p = enEstado('postulado', deps);
    const ctx = { ...deps, ...SEGURAS };
    p.registrarSenal({ ...rechazo, referenciaExterna: '<id@correo>' }, ctx);
    expect(() => p.registrarSenal({ ...rechazo, referenciaExterna: '<id@correo>' }, ctx)).toThrow(
      SenalDuplicada,
    );
    expect(p.datos().senales).toHaveLength(1);
  });

  it('aplicar a mano mueve al estado sugerido y la marca', () => {
    const p = enEstado('postulado', deps, {
      historial: [
        { id: 'h1', de: null, a: 'postulado', origen: 'importacion', ocurridoEn: deps.reloj.ahora() },
      ],
    });
    const s = p.registrarSenal(rechazo, { ...deps, ...SEGURAS });
    p.aplicarSenal(s.id, deps);
    expect(p.estado).toBe('rechazado');
    expect(p.datos().senales[0]?.aplicada).toBe(true);
    expect(() => p.aplicarSenal(s.id, deps)).toThrow(DatoInvalido);
    expect(() => p.aplicarSenal('no-existe', deps)).toThrow(NoEncontrada);
  });

  it('aplicar una señal sin estado sugerido falla', () => {
    const p = enEstado('postulado', deps);
    const s = p.registrarSenal(
      { fuente: 'manual', resumen: 'Solo información', confianza: 1 },
      { ...deps, ...SEGURAS },
    );
    expect(() => p.aplicarSenal(s.id, deps)).toThrow(DatoInvalido);
  });

  function sinPostular(extra: Partial<PostulacionDatos> = {}) {
    const { fechaPostulacion: _f, canal: _c, ...resto } = enEstado('por_postular', deps).datos();
    return Postulacion.reconstituir({ ...resto, ...extra });
  }

  it('una señal de «postulado» trae la fecha y el canal que exige R2', () => {
    const p = sinPostular();
    const s = p.registrarSenal(
      {
        fuente: 'correo',
        plataforma: 'getonboard',
        resumen: 'Recibimos tu postulación',
        estadoSugerido: 'postulado',
        confianza: 0.98,
        recibidaEn: new Date('2026-11-20T15:00:00Z'),
      },
      { ...deps, aplicarSeguras: true, umbral: 0.9 },
    );
    expect(s.aplicada).toBe(true);
    expect(p.estado).toBe('postulado');
    expect(p.datos().fechaPostulacion).toBe('2026-11-20');
    expect(p.datos().canal).toEqual({ tipo: 'portal', valor: 'getonboard' });
  });

  it('si la señal no sabe la plataforma, el canal usa la del aviso', () => {
    const p = sinPostular();
    const s = p.registrarSenal(
      {
        fuente: 'correo',
        plataforma: 'otra',
        resumen: 'Recibida',
        estadoSugerido: 'postulado',
        confianza: 0.95,
      },
      { ...deps, aplicarSeguras: true, umbral: 0.9 },
    );
    expect(s.aplicada).toBe(true);
    expect(p.datos().canal).toEqual({ tipo: 'portal', valor: p.datos().aviso.plataforma });
  });

  it('la fecha de una señal de «postulado» nunca queda en el futuro y respeta el canal existente', () => {
    const p = sinPostular({ canal: { tipo: 'email', valor: 'rrhh@ejemplo.test' } });
    const s = p.registrarSenal(
      {
        fuente: 'manual',
        resumen: 'Postulé',
        estadoSugerido: 'postulado',
        confianza: 1,
        recibidaEn: new Date('2026-11-30T12:00:00Z'),
      },
      { ...deps, ...SEGURAS },
    );
    p.aplicarSenal(s.id, deps);
    expect(p.datos().fechaPostulacion).toBe(deps.reloj.hoy());
    expect(p.datos().canal).toEqual({ tipo: 'email', valor: 'rrhh@ejemplo.test' });
  });

  it('aplicar una señal que coincide con el estado actual solo la marca', () => {
    const p = enEstado('rechazado', deps);
    const s = p.registrarSenal(rechazo, { ...deps, ...SEGURAS });
    p.aplicarSenal(s.id, deps);
    expect(p.estado).toBe('rechazado');
    expect(p.datos().historial).toHaveLength(1);
  });
});

describe('R12: prioridad', () => {
  it('una señal en una descartada se registra con prioridad baja', () => {
    const p = enEstado('descartado', deps);
    p.registrarSenal(
      { fuente: 'correo', resumen: 'Te invitamos', estadoSugerido: 'entrevista', confianza: 0.9 },
      { ...deps, ...SEGURAS },
    );
    const ev = p.sacarEventos().find((e) => e.tipo === 'postulacion.senal_registrada');
    expect(ev?.prioridad).toBe('baja');
  });

  it('activa es alta', () => {
    expect(enEstado('en_proceso', deps).prioridad(deps.reloj)).toBe('alta');
  });
});

describe('R13: movimientos que no calzan con la evidencia', () => {
  const ctx = () => ({ ...deps, ...SEGURAS });

  it('mover a entrevista con un rechazo reciente abre una discrepancia', () => {
    const p = enEstado('postulado', deps, {
      historial: [
        { id: 'h1', de: null, a: 'postulado', origen: 'importacion', ocurridoEn: deps.reloj.ahora() },
      ],
    });
    p.registrarSenal(
      { fuente: 'correo', resumen: 'No continuaremos', estadoSugerido: 'rechazado', confianza: 0.92 },
      ctx(),
    );
    p.sacarEventos();
    p.cambiarEstado('entrevista', { origen: 'tablero' }, deps);
    const [d] = p.datos().discrepancias;
    expect(d).toMatchObject({ regla: 'senal_de_rechazo', estado: 'abierta', severidad: 'normal' });
    expect(tipos(p)).toEqual(['postulacion.estado_cambiado', 'postulacion.discrepancia_detectada']);
  });

  it('una señal de rechazo después de mover a entrevista abre una discrepancia', () => {
    const p = enEstado('postulado', deps);
    deps.reloj.avanzarDias(1);
    p.cambiarEstado('entrevista', { origen: 'formulario' }, deps);
    deps.reloj.avanzarDias(1);
    p.registrarSenal(
      { fuente: 'correo', resumen: 'No continuaremos', estadoSugerido: 'rechazado', confianza: 0.92 },
      ctx(),
    );
    const [d] = p.datos().discrepancias;
    expect(d).toMatchObject({ regla: 'senal_de_rechazo', cambioId: p.datos().historial.at(-1)?.id });
  });

  it('descartar con una invitación a entrevista reciente abre una discrepancia', () => {
    const p = enEstado('postulado', deps);
    p.registrarSenal(
      { fuente: 'correo', resumen: 'Te invitamos', estadoSugerido: 'entrevista', confianza: 0.9 },
      ctx(),
    );
    p.cambiarEstado('descartado', { motivo: 'No me interesa', origen: 'tablero' }, deps);
    expect(p.datos().discrepancias[0]).toMatchObject({ regla: 'senal_de_avance' });
  });

  it('mover a entrevista desde el tablero sin ninguna señal abre una informativa de severidad baja', () => {
    const p = enEstado('postulado', deps);
    p.cambiarEstado('entrevista', { origen: 'tablero' }, deps);
    expect(p.datos().discrepancias[0]).toMatchObject({ regla: 'sin_evidencia', severidad: 'baja' });
  });

  it('el mismo movimiento por formulario sin señal no abre nada', () => {
    const p = enEstado('postulado', deps);
    p.cambiarEstado('entrevista', { origen: 'formulario' }, deps);
    expect(p.datos().discrepancias).toHaveLength(0);
  });

  it('una señal de hace más de 30 días no cuenta', () => {
    const p = enEstado('postulado', deps);
    p.registrarSenal(
      {
        fuente: 'correo',
        resumen: 'No continuaremos',
        estadoSugerido: 'rechazado',
        confianza: 0.92,
        recibidaEn: new Date('2026-10-01T00:00:00Z'),
      },
      ctx(),
    );
    p.cambiarEstado('en_proceso', { origen: 'tablero' }, deps);
    expect(p.datos().discrepancias).toHaveLength(0);
  });

  it('una señal que coincide con el movimiento no abre nada', () => {
    const p = enEstado('postulado', deps);
    p.registrarSenal(
      { fuente: 'correo', resumen: 'Agendemos', estadoSugerido: 'entrevista', confianza: 0.9 },
      ctx(),
    );
    p.cambiarEstado('entrevista', { origen: 'tablero' }, deps);
    expect(p.datos().discrepancias).toHaveLength(0);
  });

  it('los movimientos importados o por señal no se revisan', () => {
    const p = enEstado('postulado', deps);
    p.registrarSenal(
      { fuente: 'correo', resumen: 'No continuaremos', estadoSugerido: 'rechazado', confianza: 0.9 },
      ctx(),
    );
    p.cambiarEstado('entrevista', { origen: 'importacion' }, deps);
    expect(p.datos().discrepancias).toHaveLength(0);
  });
});

describe('R14: resolver discrepancias', () => {
  function conDiscrepancia() {
    const p = enEstado('postulado', deps);
    p.cambiarEstado('entrevista', { origen: 'formulario' }, deps);
    p.registrarSenal(
      { fuente: 'correo', resumen: 'No continuaremos', estadoSugerido: 'rechazado', confianza: 0.92 },
      { ...deps, ...SEGURAS },
    );
    p.sacarEventos();
    return { p, id: p.datos().discrepancias[0]!.id };
  }

  it('confirmar la cierra sin borrarla', () => {
    const { p, id } = conDiscrepancia();
    p.resolverDiscrepancia(id, 'confirmar', undefined, deps);
    expect(p.datos().discrepancias[0]).toMatchObject({ estado: 'confirmada' });
    expect(p.estado).toBe('entrevista');
    expect(tipos(p)).toEqual(['postulacion.discrepancia_resuelta']);
  });

  it('corregir mueve el estado y la marca corregida', () => {
    const { p, id } = conDiscrepancia();
    p.resolverDiscrepancia(id, 'corregir', { a: 'rechazado', motivo: 'Llegó el rechazo' }, deps);
    expect(p.estado).toBe('rechazado');
    expect(p.datos().discrepancias[0]?.estado).toBe('corregida');
  });

  it('corregir sin destino, a un destino inválido o dos veces falla', () => {
    const { p, id } = conDiscrepancia();
    expect(() => p.resolverDiscrepancia(id, 'corregir', undefined, deps)).toThrow(DatoInvalido);
    expect(() => p.resolverDiscrepancia(id, 'corregir', { a: 'sin_decidir' }, deps)).toThrow(
      TransicionInvalida,
    );
    p.resolverDiscrepancia(id, 'confirmar', undefined, deps);
    expect(() => p.resolverDiscrepancia(id, 'confirmar', undefined, deps)).toThrow(DatoInvalido);
    expect(() => p.resolverDiscrepancia('no-existe', 'confirmar', undefined, deps)).toThrow(NoEncontrada);
    expect(() => p.resolverDiscrepancia(id, 'ignorar' as never, undefined, deps)).toThrow(DatoInvalido);
  });
});

describe('editar y aviso', () => {
  it('edita canal, sueldo y cierre, y puede borrar el cierre', () => {
    const p = enEstado('postulado', deps);
    p.editar(
      {
        canal: CANAL,
        sueldoPretendido: { monto: 3000, moneda: 'USD', periodo: 'mes', base: 'bruto' },
        cierre: '2026-12-01',
      },
      deps.reloj,
    );
    expect(p.aviso.cierre).toBe('2026-12-01');
    p.editar({ cierre: null, sueldoPretendido: null }, deps.reloj);
    expect(p.aviso.cierre).toBeUndefined();
    expect(p.datos().sueldoPretendido).toBeUndefined();
    expect(() => p.editar({ cierre: 'mañana' }, deps.reloj)).toThrow(DatoInvalido);
  });

  it('crearAvisoResumen valida url, plataforma y textos', () => {
    const base = { titulo: 'T', empresa: 'E', url: 'https://x.test/a', plataforma: 'linkedin' };
    expect(crearAvisoResumen(base)).toMatchObject({ modalidad: 'no_indica', ubicacion: '' });
    expect(() => crearAvisoResumen({ ...base, url: 'no es url' })).toThrow(DatoInvalido);
    expect(() => crearAvisoResumen({ ...base, url: 'ftp://x.test' })).toThrow(DatoInvalido);
    expect(() => crearAvisoResumen({ ...base, plataforma: 'myspace' })).toThrow(DatoInvalido);
    expect(() => crearAvisoResumen({ ...base, titulo: ' ' })).toThrow(DatoInvalido);
    expect(() => crearAvisoResumen({ ...base, modalidad: 'luna' })).toThrow(DatoInvalido);
    expect(() => crearAvisoResumen({ ...base, calce: 2 })).toThrow(DatoInvalido);
    expect(crearAvisoResumen({ ...base, cierre: '2026-12-01', avisoId: 'a1', calce: 0.7 })).toMatchObject({
      calce: 0.7,
    });
  });
});
