import { describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { ESTADOS, destinosDe, esTerminal, puedeIrA, type EstadoPropiedad } from './estado';
import { Propiedad, tituloSugerido } from './propiedad';
import { direccionNormalizada, telefonoOpcional, urlNormalizada } from './valores';

const nueva = (deps = depsDePrueba(), extra: Record<string, unknown> = {}) =>
  Propiedad.crear(
    {
      tipo: 'departamento',
      comuna: 'Ñuñoa',
      dormitorios: 2,
      precio: { monto: 550000, moneda: 'CLP' },
      publicacion: { canalId: 'yapo', url: 'https://www.yapo.cl/depto-123?utm_source=x' },
      ...extra,
    },
    'consola',
    deps,
  );

/** Lleva una propiedad a un estado por un camino válido. */
function llevarA(p: Propiedad, a: EstadoPropiedad, deps = depsDePrueba()) {
  const camino: Record<EstadoPropiedad, EstadoPropiedad[]> = {
    vista: [],
    contactada: ['contactada'],
    visita_agendada: ['visita_agendada'],
    visitada: ['visita_agendada', 'visitada'],
    en_evaluacion: ['contactada', 'en_evaluacion'],
    aprobada: ['contactada', 'en_evaluacion', 'aprobada'],
    arrendada: ['contactada', 'en_evaluacion', 'aprobada', 'arrendada'],
    rechazada: ['contactada', 'rechazada'],
    descartada: ['descartada'],
    no_disponible: ['no_disponible'],
  };
  for (const e of camino[a])
    p.cambiarEstado(e, { motivo: 'prueba', fechaVisita: '2026-11-25T15:00:00Z' }, 'consola', deps);
}

describe('estados de una propiedad', () => {
  // Las 100 combinaciones: cada salto permitido funciona y cada uno no permitido falla con su código.
  for (const de of ESTADOS)
    for (const a of ESTADOS)
      it(`${de} → ${a} ${puedeIrA(de, a) ? 'se puede' : 'no se puede'}`, () => {
        const deps = depsDePrueba();
        const p = nueva(deps);
        llevarA(p, de, deps);
        expect(p.estado).toBe(de);
        const mover = () =>
          p.cambiarEstado(a, { motivo: 'm', fechaVisita: '2026-11-26T10:00:00Z' }, 'consola', deps);
        if (puedeIrA(de, a)) {
          mover();
          expect(p.estado).toBe(a);
        } else {
          expect(mover).toThrow(
            expect.objectContaining({ codigo: esTerminal(de) ? 'ESTADO_TERMINAL' : 'TRANSICION_INVALIDA' }),
          );
        }
      });

  it('solo arrendada y rechazada son terminales; descartada y no disponible se reabren', () => {
    expect(ESTADOS.filter(esTerminal)).toEqual(['arrendada', 'rechazada']);
    expect(destinosDe('descartada')).toEqual(['vista']);
    expect(destinosDe('no_disponible')).toEqual(['vista']);
  });

  it('descartar pide motivo y reabrir lo borra', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    expect(() => p.cambiarEstado('descartada', {}, 'consola', deps)).toThrow(/motivo/);
    p.cambiarEstado('descartada', { motivo: 'muy lejos' }, 'consola', deps);
    expect(p.datos().motivoCierre).toBe('muy lejos');
    p.cambiarEstado('vista', {}, 'consola', deps);
    expect(p.datos().motivoCierre).toBeUndefined();
  });

  it('agendar visita pide fecha y la deja agendada; visitada la marca hecha', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    expect(() => p.cambiarEstado('visita_agendada', {}, 'consola', deps)).toThrow(/fecha/);
    p.cambiarEstado('visita_agendada', { fechaVisita: '2026-11-25T15:00:00Z' }, 'consola', deps);
    expect(p.datos().visitas[0]?.estado).toBe('agendada');
    p.cambiarEstado('visitada', {}, 'consola', deps);
    expect(p.datos().visitas[0]?.estado).toBe('hecha');
    expect(p.datos().discrepancias).toEqual([]);
  });

  it('en evaluación guarda los documentos enviados sin repetir', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    p.cambiarEstado('contactada', {}, 'consola', deps);
    p.cambiarEstado(
      'en_evaluacion',
      { documentos: ['Liquidaciones', 'Contrato', 'Liquidaciones'] },
      'ia',
      deps,
    );
    expect(p.datos().documentosEnviados).toEqual(['Liquidaciones', 'Contrato']);
  });

  it('cada cambio queda con su origen y emite un evento', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    p.sacarEventos();
    p.cambiarEstado('contactada', {}, 'ia', deps);
    expect(p.datos().cambios.map((c) => [c.de, c.a, c.origen])).toEqual([
      [null, 'vista', 'consola'],
      ['vista', 'contactada', 'ia'],
    ]);
    expect(p.sacarEventos().map((e) => e.tipo)).toEqual(['propiedad.estado_cambiado']);
  });
});

describe('datos de la propiedad', () => {
  it('sugiere un título y normaliza la URL de la publicación', () => {
    const p = nueva();
    expect(p.datos().titulo).toBe('Departamento 2D en Ñuñoa');
    expect(p.urlsClave()).toEqual(['yapo.cl/depto-123']);
    expect(tituloSugerido({ tipo: 'casa', direccion: 'Los Olmos 12' })).toBe('Casa en Los Olmos 12');
  });

  it('valida números, monedas y tipos', () => {
    const deps = depsDePrueba();
    expect(() => nueva(deps, { dormitorios: -1 })).toThrow(/dormitorios/);
    expect(() => nueva(deps, { precio: { monto: 10, moneda: 'USD' } })).toThrow(/moneda/);
    expect(() => nueva(deps, { tipo: 'castillo' })).toThrow(/tipo/);
    expect(nueva(deps, { precio: { monto: 15.5, moneda: 'UF' } }).datos().precio).toEqual({
      monto: 15.5,
      moneda: 'UF',
    });
  });

  it('editar cambia solo lo que viene, null borra, y mover la dirección borra el pin automático', () => {
    const deps = depsDePrueba();
    const p = nueva(deps, { direccion: 'Irarrázaval 3000', gastosComunes: 80000 });
    p.fijarUbicacion({ lat: -33.45, lon: -70.6, origen: 'geocodificada' }, deps.reloj);
    p.editar({ gastosComunes: null, banos: 2 }, deps.reloj);
    expect(p.datos().gastosComunes).toBeUndefined();
    expect(p.datos().banos).toBe(2);
    expect(p.datos().ubicacion).toBeDefined();
    p.editar({ direccion: 'Irarrázaval 3100' }, deps.reloj);
    expect(p.datos().ubicacion).toBeUndefined();
  });

  it('un pin manual no lo pisa la geocodificación', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    p.fijarUbicacion({ lat: -33.4, lon: -70.6, origen: 'manual' }, deps.reloj);
    p.fijarUbicacion({ lat: -33.5, lon: -70.7, origen: 'geocodificada' }, deps.reloj);
    expect(p.datos().ubicacion).toEqual({ lat: -33.4, lon: -70.6, origen: 'manual' });
    expect(() => p.fijarUbicacion({ lat: 100, lon: 0, origen: 'manual' }, deps.reloj)).toThrow(/lat/);
  });

  it('una publicación repetida no se agrega dos veces', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    p.agregarPublicacion({ canalId: 'yapo', url: 'yapo.cl/depto-123/' }, deps);
    p.agregarPublicacion({ canalId: 'toctoc', url: 'https://toctoc.com/arriendo/9' }, deps);
    expect(p.urlsClave()).toEqual(['yapo.cl/depto-123', 'toctoc.com/arriendo/9']);
  });

  it('absorber un duplicado suma publicaciones y contactos y completa lo que faltaba', () => {
    const deps = depsDePrueba();
    const a = nueva(deps);
    const b = nueva(deps, {
      gastosComunes: 70000,
      publicacion: { canalId: 'toctoc', url: 'https://toctoc.com/x/1' },
    });
    b.registrarContacto({ nombre: 'Ana', rol: 'corredor', telefono: '+56 9 1111 2222' }, deps);
    a.absorber(b, deps.reloj);
    expect(a.urlsClave()).toHaveLength(2);
    expect(a.datos().contactos.map((c) => c.nombre)).toEqual(['Ana']);
    expect(a.datos().gastosComunes).toBe(70000);
  });
});

describe('contactos y conversaciones', () => {
  it('reconoce al mismo contacto por teléfono y completa sus datos', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    const id = p.registrarContacto({ nombre: 'Pedro Soto', rol: 'corredor', telefono: '9 8765 4321' }, deps);
    const otra = p.registrarContacto(
      { nombre: 'Pedro', whatsapp: '+56987654321', correo: 'PEDRO@corredora.cl' },
      deps,
    );
    expect(otra).toBe(id);
    const c = p.datos().contactos[0]!;
    expect(c).toMatchObject({ telefono: '+56987654321', correo: 'pedro@corredora.cl', rol: 'corredor' });
  });

  it('un mensaje enviado contacta la propiedad; el último mensaje decide a quién le toca', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    const c = p.registrarContacto({ nombre: 'Ana', canalId: 'whatsapp' }, deps);
    expect(p.pendiente()).toBeNull();
    p.registrarInteraccion(c, { tipo: 'mensaje_enviado', resumen: 'Hola, ¿sigue disponible?' }, 'ia', deps);
    expect(p.estado).toBe('contactada');
    expect(p.pendiente()).toBe('esperando');
    deps.reloj.avanzarDias(1);
    p.registrarInteraccion(c, { tipo: 'mensaje_recibido', resumen: 'Sí, ¿cuándo puedes verlo?' }, 'ia', deps);
    expect(p.pendiente()).toBe('responder');
    expect(p.datos().contactos[0]!.interacciones[0]!.canalId).toBe('whatsapp');
  });

  it('no repite la misma interacción el mismo día ni acepta fechas futuras', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    const c = p.registrarContacto({ nombre: 'Ana' }, deps);
    expect(p.registrarInteraccion(c, { tipo: 'llamada', resumen: 'Llamé' }, 'consola', deps)).toBe(true);
    expect(p.registrarInteraccion(c, { tipo: 'llamada', resumen: 'Llamé' }, 'consola', deps)).toBe(false);
    expect(() =>
      p.registrarInteraccion(
        c,
        { tipo: 'llamada', resumen: 'x', ocurridaEn: new Date('2030-01-01') },
        'consola',
        deps,
      ),
    ).toThrow(/futura/);
    expect(() => p.registrarInteraccion('otro', { tipo: 'llamada', resumen: 'x' }, 'consola', deps)).toThrow(
      /contacto/,
    );
  });
});

describe('señales y discrepancias', () => {
  it('una señal segura de correo cambia el estado sola; una manual queda como sugerencia', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    p.cambiarEstado('contactada', {}, 'consola', deps);
    const r = p.registrarSenal(
      { fuente: 'manual', resumen: 'Me dijeron que sí', estadoSugerido: 'en_evaluacion', confianza: 1 },
      0.9,
      deps,
    );
    expect(r).toEqual({ registrada: true, aplicada: false });
    expect(p.estado).toBe('contactada');
    const s = p.registrarSenal(
      {
        fuente: 'correo',
        resumen: 'Ya se arrendó',
        estadoSugerido: 'no_disponible',
        confianza: 0.95,
        referenciaExterna: 'm1',
      },
      0.9,
      deps,
    );
    expect(s.aplicada).toBe(true);
    expect(p.estado).toBe('no_disponible');
    expect(p.datos().motivoCierre).toBe('Ya se arrendó');
    expect(
      p.registrarSenal({ fuente: 'correo', resumen: 'otra vez', referenciaExterna: 'm1' }, 0.9, deps)
        .registrada,
    ).toBe(false);
  });

  it('aplicar a mano una señal mueve el estado', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    p.registrarSenal(
      { fuente: 'ia', resumen: 'Respondió el corredor', estadoSugerido: 'contactada' },
      0.9,
      deps,
    );
    p.aplicarSenal(p.datos().senales[0]!.id, 'consola', deps);
    expect(p.estado).toBe('contactada');
    expect(p.datos().senales[0]!.aplicada).toBe(true);
  });

  it('avanzar contra una señal que dice que ya no está abre una discrepancia', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    p.registrarSenal(
      { fuente: 'manual', resumen: 'Se arrendó a otro', estadoSugerido: 'no_disponible' },
      0.9,
      deps,
    );
    p.cambiarEstado('contactada', {}, 'consola', deps);
    expect(p.datos().discrepancias).toMatchObject([{ regla: 'contra_senal', estado: 'abierta' }]);
    p.resolverDiscrepancia(p.datos().discrepancias[0]!.id, deps.reloj);
    expect(p.datos().discrepancias[0]!.estado).toBe('resuelta');
  });

  it('marcar visitada sin visita agendada abre una discrepancia', () => {
    const deps = depsDePrueba();
    const p = nueva(deps);
    p.cambiarEstado('visita_agendada', { fechaVisita: '2026-11-25T15:00:00Z' }, 'consola', deps);
    p.cambiarVisita(p.datos().visitas[0]!.id, 'cancelada', deps.reloj);
    p.cambiarEstado('visitada', {}, 'consola', deps);
    expect(p.datos().discrepancias.map((d) => d.regla)).toEqual(['visita_sin_registro']);
  });
});

describe('normalización', () => {
  it('URL sin esquema, www, seguimiento ni barra final', () => {
    expect(urlNormalizada('https://www.portalinmobiliario.com/MLC-123-depto/?utm_source=mail&id=4')).toBe(
      'portalinmobiliario.com/MLC-123-depto?id=4',
    );
  });

  it('dirección sin tildes, abreviaturas ni número de departamento', () => {
    expect(direccionNormalizada('Av. Irarrázaval 3000, depto 504')).toBe(
      direccionNormalizada('avenida irarrazaval 3000'),
    );
  });

  it('teléfonos chilenos con +56', () => {
    expect(telefonoOpcional('t', '9 8765 4321')).toBe('+56987654321');
    expect(telefonoOpcional('t', '+56 2 2345 6789')).toBe('+56223456789');
    expect(() => telefonoOpcional('t', '123')).toThrow();
  });
});
