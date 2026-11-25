import { describe, expect, it } from 'vitest';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import {
  montosDe,
  PerfilEmpleo,
  perfilVacio,
  revisarPostulacion,
  zonasDe,
  type AvisoARevisar,
  type DatosPerfilEmpleo,
} from './perfil-empleo';

/** El perfil que fijó Juan el 24-nov-2026 (perfil.md §6), con valores de ejemplo para los chequeos. */
function perfilDeJuan(): DatosPerfilEmpleo {
  const p = PerfilEmpleo.reconstituir(perfilVacio());
  p.cambiar(
    {
      agregar: [
        {
          texto: 'Full stack o backend; no planificación ni frontend puro',
          criterio: 'titulo',
          valor: { incluir: ['full stack', 'backend'], excluir: ['frontend', 'front end', 'planificación'] },
          etiquetas: ['rol'],
        },
        {
          texto:
            'Valparaíso presencial, híbrido o remoto; Santiago solo híbrido o remoto; otro lugar solo remoto',
          criterio: 'modalidad_por_region',
          valor: {
            valparaiso: ['presencial', 'hibrido', 'remoto'],
            santiago: ['hibrido', 'remoto'],
            otra: ['remoto'],
            noIndicaEsPresencialEn: ['trabajando'],
          },
          etiquetas: ['ubicacion', 'santiago'],
        },
        {
          texto: 'Sin contratos cortos ni pasantías',
          criterio: 'titulo',
          valor: { excluir: ['pasantía', 'práctica', 'reemplazo', 'plazo fijo'] },
          etiquetas: ['contrato'],
        },
        { texto: 'Nada de liderazgo que pida 4 años o más', etiquetas: ['rol'] },
        {
          texto: 'Ojalá con sueldo publicado',
          criterio: 'sueldo_publicado',
          dura: false,
          etiquetas: ['sueldo'],
        },
      ],
      datos: {
        rentaPretendida: 1_400_000,
        disponibleDesde: '2026-12-31',
        notas: 'Las ya enviadas no se descartan',
      },
      motivo: 'Perfil inicial de Juan',
    },
    'importacion',
    depsDePrueba(),
  );
  return p.datos();
}

const aviso = (a: Partial<AvisoARevisar>): AvisoARevisar => ({
  titulo: 'Desarrollador Backend',
  modalidad: 'hibrido',
  ubicacion: 'Las Condes, Santiago',
  plataforma: 'linkedin',
  sueldoPublicado: '$1.500.000 líquidos',
  ...a,
});

describe('perfil de Empleo', () => {
  it('describe solas las reglas con chequeo y guarda los datos', () => {
    const p = perfilDeJuan();
    expect(p.datos).toEqual({
      rentaPretendida: 1_400_000,
      disponibleDesde: '2026-12-31',
      notas: 'Las ya enviadas no se descartan',
    });
    expect(p.historial).toHaveLength(1);
    expect(p.reglas.map((r) => [r.dura, r.prioridad ?? null, r.etiquetas])).toEqual([
      [true, null, ['rol']],
      [true, null, ['ubicacion', 'santiago']],
      [true, null, ['contrato']],
      [true, null, ['rol']],
      [false, 1, ['sueldo']],
    ]);
  });

  it('un aviso que calza con todo no choca', () => {
    expect(revisarPostulacion(aviso({}), perfilDeJuan())).toEqual({
      cumpleDuras: true,
      choques: [],
      sinDato: [],
    });
  });

  it('presencial en Santiago choca con la dura; en Viña del Mar no', () => {
    const r = revisarPostulacion(aviso({ modalidad: 'presencial' }), perfilDeJuan())!;
    expect(r.cumpleDuras).toBe(false);
    expect(r.choques[0]!.texto).toBe('Presencial en Santiago; ahí solo aceptas híbrido, remoto');
    expect(
      revisarPostulacion(aviso({ modalidad: 'presencial', ubicacion: 'Viña del Mar' }), perfilDeJuan())!
        .cumpleDuras,
    ).toBe(true);
  });

  it('en trabajando.cl, sin modalidad en Santiago cuenta como presencial; en otro portal queda sin dato', () => {
    const r = revisarPostulacion(
      aviso({ modalidad: 'no_indica', plataforma: 'trabajando', ubicacion: 'Santiago' }),
      perfilDeJuan(),
    )!;
    expect(r.choques.map((c) => c.texto)).toEqual([
      'Sin modalidad en trabajando cuenta como presencial en Santiago; ahí solo aceptas híbrido, remoto',
    ]);
    const otro = revisarPostulacion(
      aviso({ modalidad: 'no_indica', plataforma: 'getonboard' }),
      perfilDeJuan(),
    )!;
    expect(otro.cumpleDuras).toBe(true);
    expect(otro.sinDato.map((s) => s.texto)).toEqual(['El aviso no dice la modalidad']);
  });

  it('fuera de Valparaíso y Santiago solo remoto; sin ubicación reconocible, remoto cumple y lo demás queda sin dato', () => {
    expect(
      revisarPostulacion(aviso({ ubicacion: 'Concepción, Biobío' }), perfilDeJuan())!.choques[0]!.texto,
    ).toBe('Híbrido en otro lugar; ahí solo aceptas remoto');
    expect(
      revisarPostulacion(aviso({ ubicacion: 'Chile', modalidad: 'remoto' }), perfilDeJuan())!.cumpleDuras,
    ).toBe(true);
    expect(revisarPostulacion(aviso({ ubicacion: 'LATAM' }), perfilDeJuan())!.sinDato[0]!.texto).toMatch(
      /No se reconoce/,
    );
  });

  it('el título: frontend puro choca, «Frontend / Backend» no, y un título sin rol queda para tu IA', () => {
    const t = (titulo: string) => revisarPostulacion(aviso({ titulo }), perfilDeJuan())!;
    expect(t('Desarrollador Frontend Angular').choques[0]!.texto).toBe('El título dice «frontend»');
    expect(t('Frontend / Backend Developer').cumpleDuras).toBe(true);
    expect(t('Fullstack Developer').cumpleDuras).toBe(true);
    expect(t('Analista de Planificación').choques[0]!.texto).toBe('El título dice «planificación»');
    expect(t('Ingeniero de Software').sinDato[0]!.texto).toMatch(/no dice el rol/);
    expect(t('Práctica Profesional Backend').choques.map((c) => c.texto)).toEqual([
      'El título dice «práctica»',
    ]);
  });

  it('sueldo: sin sueldo publicado o bajo la renta es un choque blando', () => {
    const s = (sueldoPublicado: string | null) =>
      revisarPostulacion(aviso({ sueldoPublicado }), perfilDeJuan())!;
    expect(s(null)).toMatchObject({
      cumpleDuras: true,
      choques: [{ dura: false, prioridad: 1, texto: 'No publica sueldo' }],
    });
    expect(s('$1.000.000 a $1.200.000').choques[0]!.texto).toBe(
      'Publica hasta $1.200.000, bajo los $1.400.000 que pides',
    );
    expect(s('1,5 millones').choques).toEqual([]);
    expect(s('USD 3.000').choques).toEqual([]);
  });

  it('las duras van antes que las blandas en los choques', () => {
    const r = revisarPostulacion(aviso({ modalidad: 'presencial', sueldoPublicado: null }), perfilDeJuan())!;
    expect(r.choques.map((c) => c.dura)).toEqual([true, false]);
  });

  it('sin reglas con chequeo no hay nada que revisar', () => {
    expect(revisarPostulacion(aviso({}), perfilVacio())).toBeNull();
  });

  it('valida los valores de cada chequeo y los datos', () => {
    const p = PerfilEmpleo.reconstituir(perfilVacio());
    const d = depsDePrueba();
    expect(() => p.cambiar({ agregar: [{ criterio: 'titulo', valor: {} }], motivo: 'x' }, 'ia', d)).toThrow(
      /al menos una palabra/,
    );
    expect(() =>
      p.cambiar(
        {
          agregar: [{ criterio: 'modalidad_por_region', valor: { santiago: ['teletrabajo'] } }],
          motivo: 'x',
        },
        'ia',
        d,
      ),
    ).toThrow(/teletrabajo/);
    expect(() => p.cambiar({ datos: { disponibleDesde: '31-12-2026' }, motivo: 'x' }, 'ia', d)).toThrow(
      /AAAA-MM-DD/,
    );
  });
});

describe('ubicaciones y montos', () => {
  it('reconoce comunas de Valparaíso y Santiago', () => {
    expect(zonasDe('Viña del Mar, Región de Valparaíso')).toEqual(['valparaiso']);
    expect(zonasDe('Providencia, RM')).toEqual(['santiago']);
    expect(zonasDe('Santiago o Valparaíso')).toEqual(['valparaiso', 'santiago']);
    expect(zonasDe('Calera de Tango')).toEqual(['santiago']);
    expect(zonasDe('Remoto')).toEqual([]);
    expect(zonasDe('Antofagasta')).toEqual(['otra']);
  });

  it('lee montos escritos a mano', () => {
    expect(montosDe('$1.200.000 - $1.800.000 brutos')).toEqual([1_200_000, 1_800_000]);
    expect(montosDe('Entre 1,2 y 1,5 millones')).toEqual([1_500_000]);
    expect(montosDe('A convenir')).toBeNull();
  });
});
