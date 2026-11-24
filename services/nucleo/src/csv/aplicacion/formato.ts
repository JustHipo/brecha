import { PRIORIDADES, type Prioridad } from '../../compartido/dominio/evento-de-dominio';
import { esFecha, type Fecha } from '../../compartido/dominio/puertos';
import { DatoInvalido } from '../../postulaciones/dominio/errores';
import { ESTADOS, esEstado, type EstadoPostulacion } from '../../postulaciones/dominio/estado';
import {
  esUno,
  MODALIDADES,
  plataformaDesdeUrl,
  PLATAFORMAS,
  TIPOS_DE_CANAL,
} from '../../postulaciones/dominio/objetos-valor/valores';
import type { FichaImportable } from '../../postulaciones/aplicacion/importar-fichas';

/**
 * Formato de los dos CSV (docs/diseno/csv.md §2): coma, UTF-8 y encabezado. Una sola fuente de las columnas
 * para importar, exportar y la plantilla.
 */
export const COLUMNAS_POSTULACIONES = [
  'titulo',
  'empresa',
  'url',
  'plataforma',
  'modalidad',
  'ubicacion',
  'cierre',
  'estado',
  'prioridad',
  'fecha_postulacion',
  'canal_tipo',
  'canal_valor',
  'correo_postulacion',
  'sueldo_publicado',
  'stack',
  'requisitos',
  'etiquetas',
  'notas',
  'motivo',
] as const;

export const COLUMNAS_CONTACTOS = [
  'nombre',
  'perfil_url',
  'titular',
  'empresa',
  'correo',
  'url_postulacion',
  'motivo',
  'mensaje_sugerido',
] as const;

export const TIPOS_CSV = ['postulaciones', 'contactos'] as const;
export type TipoCsv = (typeof TIPOS_CSV)[number];

export const COLUMNAS: Record<TipoCsv, readonly string[]> = {
  postulaciones: COLUMNAS_POSTULACIONES,
  contactos: COLUMNAS_CONTACTOS,
};
const OBLIGATORIAS: Record<TipoCsv, readonly string[]> = {
  postulaciones: ['titulo', 'empresa', 'url'],
  contactos: ['nombre'],
};

/** Una tabla ya leída: las columnas en minúsculas y cada fila con su número de línea en el archivo. */
export interface TablaCsv {
  columnas: string[];
  filas: { linea: number; valores: Record<string, string> }[];
}

/** Puerto: leer y escribir CSV es un detalle de infraestructura (csv-parse y csv-stringify). */
export interface LectorCsv {
  leer(texto: string): TablaCsv;
  escribir(columnas: readonly string[], filas: string[][]): string;
}

export const MOTIVO_POR_DEFECTO = 'Importado desde CSV';
export const SEPARADOR_NOTAS = '\n---\n';
const SEPARADOR_LISTA = ';';

/** Estados en los que ya se postuló: piden fecha y canal (R2), también al importar. */
const YA_POSTULO: readonly EstadoPostulacion[] = [
  'postulado',
  'en_proceso',
  'entrevista',
  'oferta',
  'aceptada',
  'rechazado',
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function detectarTipo(columnas: readonly string[]): TipoCsv | null {
  if (columnas.includes('titulo') && columnas.includes('url')) return 'postulaciones';
  if (
    columnas.includes('nombre') &&
    (columnas.includes('perfil_url') || columnas.includes('url_postulacion'))
  )
    return 'contactos';
  return null;
}

/** Falta una columna obligatoria: corta todo el archivo. Una desconocida: advertencia. */
export function revisarEncabezado(tipo: TipoCsv, columnas: readonly string[]): string[] {
  const faltan = OBLIGATORIAS[tipo].filter((c) => !columnas.includes(c));
  if (faltan.length) {
    throw new DatoInvalido(
      'csv',
      `Al CSV de ${tipo} le falta la columna ${faltan.join(', ')}. La primera fila tiene que ser el encabezado: ${COLUMNAS[tipo].join(',')}`,
    );
  }
  const desconocidas = columnas.filter((c) => c && !COLUMNAS[tipo].includes(c));
  return desconocidas.length ? [`Columnas que no se usan: ${desconocidas.join(', ')}`] : [];
}

export const lista = (v: string | undefined) =>
  (v ?? '')
    .split(SEPARADOR_LISTA)
    .map((x) => x.trim())
    .filter(Boolean);

export const separarNotas = (v: string | undefined) =>
  (v ?? '')
    .split(/\r?\n-{3,}\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

const texto = (v: Record<string, string>, c: string) => (v[c] ?? '').trim();

function enumerado<T extends string>(
  columna: string,
  valor: string,
  opciones: readonly T[],
  nombre: string,
): T | undefined {
  if (!valor) return undefined;
  const x = valor.toLowerCase();
  if (!esUno(opciones, x)) {
    throw new DatoInvalido(columna, `${nombre} desconocida: «${valor}». Usa ${opciones.join(', ')}`);
  }
  return x;
}

function fecha(columna: string, valor: string): Fecha | undefined {
  if (!valor) return undefined;
  if (!esFecha(valor)) throw new DatoInvalido(columna, `«${valor}» no es una fecha AAAA-MM-DD`);
  return valor;
}

/** Una fila del CSV de postulaciones → ficha para `ImportarFichas`. Las reglas del aviso las revisa el dominio. */
export function filaAFicha(
  v: Record<string, string>,
  hoy: Fecha,
): { ficha: FichaImportable; advertencias: string[] } {
  const advertencias: string[] = [];
  const url = texto(v, 'url');
  if (!url) throw new DatoInvalido('url', 'Falta la URL del aviso');
  const plataforma =
    enumerado('plataforma', texto(v, 'plataforma'), PLATAFORMAS, 'Plataforma') ?? plataformaDesdeUrl(url);
  const modalidad = enumerado('modalidad', texto(v, 'modalidad'), MODALIDADES, 'Modalidad') ?? 'no_indica';
  const cierre = fecha('cierre', texto(v, 'cierre'));
  const estadoTexto = texto(v, 'estado').toLowerCase() || 'sin_decidir';
  if (!esEstado(estadoTexto)) {
    throw new DatoInvalido('estado', `Estado desconocido: «${estadoTexto}». Usa ${ESTADOS.join(', ')}`);
  }
  const estado: EstadoPostulacion = estadoTexto;
  const prioridad: Prioridad | undefined = enumerado(
    'prioridad',
    texto(v, 'prioridad'),
    PRIORIDADES,
    'Prioridad',
  );

  const fechaPostulacion = fecha('fecha_postulacion', texto(v, 'fecha_postulacion'));
  if (fechaPostulacion && fechaPostulacion > hoy)
    throw new DatoInvalido('fecha_postulacion', 'La fecha de postulación no puede ser futura');
  const canalTipo = enumerado('canal_tipo', texto(v, 'canal_tipo'), TIPOS_DE_CANAL, 'Tipo de canal');
  const canalValor = texto(v, 'canal_valor');
  // R2 al importar: desde postulado en adelante; descartado solo si trae alguno de los datos (csv.md P8).
  const traeAlguno = Boolean(fechaPostulacion || canalTipo || canalValor);
  if (YA_POSTULO.includes(estado) || (estado === 'descartado' && traeAlguno)) {
    if (!fechaPostulacion)
      throw new DatoInvalido('fecha_postulacion', `Con estado ${estado} hace falta la fecha de postulación`);
    if (!canalTipo) throw new DatoInvalido('canal_tipo', `Con estado ${estado} hace falta el tipo de canal`);
    if (!canalValor) throw new DatoInvalido('canal_valor', `Con estado ${estado} hace falta el canal`);
  }
  if (canalTipo === 'email' && canalValor && !EMAIL.test(canalValor))
    throw new DatoInvalido('canal_valor', `«${canalValor}» no es un correo válido`);

  const correoPostulacion = texto(v, 'correo_postulacion');
  if (correoPostulacion && !EMAIL.test(correoPostulacion))
    throw new DatoInvalido('correo_postulacion', `«${correoPostulacion}» no es un correo válido`);

  const motivoTexto = texto(v, 'motivo');
  const cierra = estado === 'rechazado' || estado === 'descartado';
  if (motivoTexto && !cierra)
    advertencias.push('El motivo solo se usa con rechazado o descartado: se ignoró');

  const stack = lista(v['stack']);
  const requisitos = texto(v, 'requisitos');
  const sueldoPublicado = texto(v, 'sueldo_publicado');
  const ubicacion = texto(v, 'ubicacion');
  const etiquetas = lista(v['etiquetas']);
  const notas = separarNotas(v['notas']);

  return {
    ficha: {
      aviso: {
        titulo: texto(v, 'titulo'),
        empresa: texto(v, 'empresa'),
        url,
        plataforma,
        modalidad,
        ...(ubicacion ? { ubicacion } : {}),
        ...(cierre ? { cierre } : {}),
        ...(stack.length ? { stack } : {}),
        ...(requisitos ? { requisitos } : {}),
        ...(sueldoPublicado ? { sueldoPublicado } : {}),
      },
      estado,
      ...(fechaPostulacion ? { fechaPostulacion } : {}),
      ...(canalTipo && canalValor ? { canal: { tipo: canalTipo, valor: canalValor } } : {}),
      ...(cierra ? { motivo: motivoTexto || MOTIVO_POR_DEFECTO } : {}),
      ...(etiquetas.length ? { etiquetas } : {}),
      ...(prioridad ? { prioridad } : {}),
      ...(correoPostulacion ? { correoPostulacion } : {}),
      ...(notas.length ? { notas } : {}),
    },
    advertencias,
  };
}

/** El campo que reporta el dominio (`aviso.url`) → la columna del CSV (`url`). */
export function columnaDe(campo: string | undefined): string | undefined {
  if (!campo) return undefined;
  const mapa: Record<string, string> = {
    'aviso.titulo': 'titulo',
    'aviso.empresa': 'empresa',
    'aviso.url': 'url',
    'aviso.plataforma': 'plataforma',
    'aviso.modalidad': 'modalidad',
    'aviso.ubicacion': 'ubicacion',
    'aviso.cierre': 'cierre',
    'aviso.stack': 'stack',
    'aviso.requisitos': 'requisitos',
    'aviso.sueldoPublicado': 'sueldo_publicado',
    fechaPostulacion: 'fecha_postulacion',
    'canal.tipo': 'canal_tipo',
    'canal.valor': 'canal_valor',
    email: 'correo_postulacion',
    perfilUrl: 'perfil_url',
  };
  return mapa[campo] ?? campo;
}

// ── Notas de los contactos: líneas con etiqueta, para poder volver a separarlas al exportar ──────────

const ETIQUETAS_NOTA = [
  ['correo', 'Correo'],
  ['motivo', 'Motivo'],
  ['mensaje_sugerido', 'Mensaje sugerido'],
] as const;
export type CampoNota = (typeof ETIQUETAS_NOTA)[number][0];

export function notasDeContacto(v: Partial<Record<CampoNota, string>>): string {
  return ETIQUETAS_NOTA.filter(([c]) => v[c]?.trim())
    .map(([c, etiqueta]) => `${etiqueta}: ${v[c]!.trim()}`)
    .join('\n');
}

/** Al revés: las líneas con etiqueta vuelven a su columna; el texto sin etiqueta va a `motivo`. */
export function camposDeNotas(notas: string | null | undefined): Record<CampoNota, string> {
  const salida: Record<CampoNota, string[]> = { correo: [], motivo: [], mensaje_sugerido: [] };
  let actual: CampoNota = 'motivo';
  let libre = true;
  for (const lineaTexto of (notas ?? '').split('\n')) {
    const etiqueta = ETIQUETAS_NOTA.find(([, e]) => lineaTexto.startsWith(`${e}: `));
    if (etiqueta) {
      actual = etiqueta[0];
      libre = false;
      salida[actual].push(lineaTexto.slice(etiqueta[1].length + 2));
    } else if (libre) {
      salida.motivo.push(lineaTexto);
    } else {
      salida[actual].push(lineaTexto);
    }
  }
  return {
    correo: salida.correo.join('\n').trim(),
    motivo: salida.motivo.join('\n').trim(),
    mensaje_sugerido: salida.mensaje_sugerido.join('\n').trim(),
  };
}

// ── Plantillas: encabezado y dos filas inventadas ─────────────────────────────────────────────────────

export const EJEMPLOS: Record<TipoCsv, string[][]> = {
  postulaciones: [
    [
      'Práctica en instrumentación',
      'Observatorio Ficticio',
      'https://ejemplo.test/avisos/practica-instrumentacion',
      'sitio_empresa',
      'presencial',
      'Valparaíso',
      '2026-12-15',
      'sin_decidir',
      'alta',
      '',
      '',
      '',
      'practicas@ejemplo.test',
      'CLP 150.000 al mes',
      'Python;MATLAB;LabVIEW',
      'Cursando 5.º año; inglés intermedio',
      'investigacion;p1',
      'Preguntar si es remunerada',
      '',
    ],
    [
      'Analista de datos en práctica',
      'Energía Ficticia',
      'https://ejemplo.test/avisos/analista-datos',
      'linkedin',
      'hibrido',
      'Santiago',
      '',
      'postulado',
      '',
      '2026-11-20',
      'portal',
      'LinkedIn',
      '',
      '',
      'Python;SQL;Excel',
      'Manejo de Python y SQL',
      'p2',
      'Primera nota\n---\nSegunda nota',
      '',
    ],
  ],
  contactos: [
    [
      'Persona Ficticia',
      'https://www.linkedin.com/in/persona-ficticia',
      'Jefa de Instrumentación',
      'Observatorio Ficticio',
      'persona@ejemplo.test',
      'https://ejemplo.test/avisos/practica-instrumentacion',
      'Lidera el área de la práctica',
      'Hola, vi la práctica de instrumentación y me interesa mucho.',
    ],
    ['Otra Persona', '', 'Investigador', 'Universidad Ficticia', '', '', 'Para conectar más adelante', ''],
  ],
};
