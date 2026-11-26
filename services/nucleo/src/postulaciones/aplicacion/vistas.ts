import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import { diasEntre, type Fecha, type Reloj } from '../../compartido/dominio/puertos';
import { destinosDe, type EstadoPostulacion } from '../dominio/estado';
import type { AvisoResumen, Canal, Contacto, Dinero } from '../dominio/objetos-valor/valores';
import type { CambioDeEstado, Discrepancia, Entrevista, Nota, Senal } from '../dominio/partes';
import type {
  CerradorDePaso,
  DatosPaso,
  EstadoDePaso,
  FuenteDePaso,
  RegistradorDePaso,
} from '../dominio/paso';
import { revisarPostulacion, type DatosPerfilEmpleo, type RevisionDePerfil } from '../dominio/perfil-empleo';
import type { PostulacionDatos } from '../dominio/postulacion';
import { calcularPrioridad } from '../dominio/politica-de-prioridad';

/** Vistas planas del lado de lectura (backend.md §4, C7). Las fechas con hora van en ISO. */
export interface VistaResumen {
  id: string;
  titulo: string;
  empresa: string;
  url: string;
  plataforma: AvisoResumen['plataforma'];
  modalidad: AvisoResumen['modalidad'];
  ubicacion: string;
  cierre: Fecha | null;
  diasAlCierre: number | null;
  estado: EstadoPostulacion;
  prioridad: Prioridad;
  /** La que fijó la persona, o null si se calcula (R12). */
  prioridadFijada: Prioridad | null;
  etiquetas: string[];
  fechaPostulacion: Fecha | null;
  senalesNuevas: number;
  discrepanciasAbiertas: number;
  /** Lo que te piden hacer, el de plazo más cercano primero (docs/diseno/pasos.md §7.1). */
  pasosPendientes: VistaPasoCorto[];
  transicionesPosibles: EstadoPostulacion[];
  /** Choques con tu perfil de búsqueda (perfil.md §3.3); null si el perfil no tiene reglas con chequeo. */
  perfil: RevisionDePerfil | null;
  version: number;
  actualizadaEn: string;
}

/** Lo que se necesita del perfil para revisar una postulación. */
export type PerfilParaRevisar = Pick<DatosPerfilEmpleo, 'reglas' | 'datos'> | null;

export interface VistaPasoCorto {
  id: string;
  descripcion: string;
  plazo: Fecha | null;
  diasAlPlazo: number | null;
}

export interface PostulacionDelPaso {
  id: string;
  empresa: string;
  titulo: string;
  estado: EstadoPostulacion;
}

export interface VistaPaso {
  id: string;
  postulacionIds: string[];
  postulaciones: PostulacionDelPaso[];
  descripcion: string;
  detalle: string | null;
  plazo: Fecha | null;
  diasAlPlazo: number | null;
  enlace: string | null;
  estado: EstadoDePaso;
  fuente: FuenteDePaso;
  registradoPor: RegistradorDePaso;
  contactoRedId: string | null;
  referenciaExterna: string | null;
  cierre: { por: CerradorDePaso; en: string; nota: string | null; referenciaExterna: string | null } | null;
  sugerenciaCierre: { referenciaExterna: string | null; confianza: number; en: string } | null;
  pedidoEn: string;
  creadoEn: string;
  actualizadoEn: string;
  version: number;
}

type ConFechaIso<T, K extends keyof T> = Omit<T, K> & { [P in K]: string };

export interface VistaDetalle extends VistaResumen {
  aviso: AvisoResumen;
  canal: Canal | null;
  sueldoPretendido: Dinero | null;
  contactos: Contacto[];
  entrevistas: ConFechaIso<Entrevista, 'fecha'>[];
  notas: ConFechaIso<Nota, 'creadaEn'>[];
  historial: ConFechaIso<CambioDeEstado, 'ocurridoEn'>[];
  senales: ConFechaIso<Senal, 'recibidaEn'>[];
  discrepancias: (Omit<Discrepancia, 'detectadaEn' | 'resueltaEn'> & {
    detectadaEn: string;
    resueltaEn: string | null;
  })[];
  /** El proceso: todos los pasos (pedidos, hechos y descartados) en el orden en que te los pidieron. */
  pasos: VistaPaso[];
  creadaEn: string;
}

export interface ColumnaTablero {
  estado: EstadoPostulacion;
  total: number;
  items: VistaResumen[];
}

export interface VistaTablero {
  columnas: ColumnaTablero[];
}

export interface ElementoResumen {
  postulacionId: string;
  empresa: string;
  titulo: string;
  tipo: 'cambio' | 'senal' | 'discrepancia' | 'nota' | 'paso';
  descripcion: string;
  prioridad: Prioridad;
  ocurridoEn: string;
}

export interface VistaExportacion {
  generadoEn: string;
  conteos: { porEstado: Record<string, number>; porPrioridad: Record<Prioridad, number> };
  postulaciones: VistaDetalle[];
}

const PESO: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

export function diasAlCierre(cierre: Fecha | undefined | null, reloj: Reloj): number | null {
  return cierre ? diasEntre(reloj.hoy(), cierre) : null;
}

/** Destinos válidos, sin los que el aviso cerrado impide (R3 y R6). */
export function transicionesPosibles(
  estado: EstadoPostulacion,
  cierre: Fecha | null | undefined,
  reloj: Reloj,
) {
  const destinos = destinosDe(estado);
  if (!cierre || diasEntre(reloj.hoy(), cierre) >= 0) return destinos;
  return destinos.filter((a) => a !== 'postulado' && !(estado === 'descartado' && a === 'sin_decidir'));
}

/** Pendientes primero por plazo (sin plazo al final) y después por cuándo te los pidieron. */
export function ordenarPendientes<T extends { plazo?: Fecha | null; pedidoEn: Date | string }>(a: T, b: T) {
  const pa = a.plazo ?? '9999-12-31';
  const pb = b.plazo ?? '9999-12-31';
  return pa.localeCompare(pb) || new Date(a.pedidoEn).getTime() - new Date(b.pedidoEn).getTime();
}

export function aPasoCorto(p: Pick<DatosPaso, 'id' | 'descripcion' | 'plazo'>, reloj: Reloj): VistaPasoCorto {
  return {
    id: p.id,
    descripcion: p.descripcion,
    plazo: p.plazo ?? null,
    diasAlPlazo: p.plazo ? diasEntre(reloj.hoy(), p.plazo) : null,
  };
}

export function aVistaPaso(
  p: DatosPaso,
  postulaciones: ReadonlyMap<string, Omit<PostulacionDelPaso, 'id'>>,
  reloj: Reloj,
): VistaPaso {
  return {
    ...aPasoCorto(p, reloj),
    postulacionIds: p.postulacionIds,
    postulaciones: p.postulacionIds.flatMap((id) => {
      const x = postulaciones.get(id);
      return x ? [{ id, ...x }] : [];
    }),
    detalle: p.detalle ?? null,
    enlace: p.enlace ?? null,
    estado: p.estado,
    fuente: p.fuente,
    registradoPor: p.registradoPor,
    contactoRedId: p.contactoRedId ?? null,
    referenciaExterna: p.referenciaExterna ?? null,
    cierre: p.cierre
      ? {
          por: p.cierre.por,
          en: p.cierre.en.toISOString(),
          nota: p.cierre.nota ?? null,
          referenciaExterna: p.cierre.referenciaExterna ?? null,
        }
      : null,
    sugerenciaCierre: p.sugerenciaCierre
      ? {
          referenciaExterna: p.sugerenciaCierre.referenciaExterna ?? null,
          confianza: p.sugerenciaCierre.confianza,
          en: p.sugerenciaCierre.en.toISOString(),
        }
      : null,
    pedidoEn: p.pedidoEn.toISOString(),
    creadoEn: p.creadoEn.toISOString(),
    actualizadoEn: p.actualizadoEn.toISOString(),
    version: p.version,
  };
}

export function aResumen(
  d: PostulacionDatos,
  reloj: Reloj,
  pasos: readonly DatosPaso[] = [],
  perfil: PerfilParaRevisar = null,
): VistaResumen {
  return {
    id: d.id,
    titulo: d.aviso.titulo,
    empresa: d.aviso.empresa,
    url: d.aviso.url,
    plataforma: d.aviso.plataforma,
    modalidad: d.aviso.modalidad,
    ubicacion: d.aviso.ubicacion,
    cierre: d.aviso.cierre ?? null,
    diasAlCierre: diasAlCierre(d.aviso.cierre, reloj),
    estado: d.estado,
    prioridad: calcularPrioridad(d.estado, d.aviso.cierre, reloj.hoy(), d.prioridadFijada),
    prioridadFijada: d.prioridadFijada ?? null,
    etiquetas: d.etiquetas,
    fechaPostulacion: d.fechaPostulacion ?? null,
    senalesNuevas: d.senales.filter((s) => !s.aplicada).length,
    discrepanciasAbiertas: d.discrepancias.filter((x) => x.estado === 'abierta').length,
    pasosPendientes: pasos
      .filter((p) => p.estado === 'pendiente')
      .sort(ordenarPendientes)
      .map((p) => aPasoCorto(p, reloj)),
    transicionesPosibles: transicionesPosibles(d.estado, d.aviso.cierre, reloj),
    perfil: perfil ? revisarPostulacion(d.aviso, perfil) : null,
    version: d.version,
    actualizadaEn: d.actualizadaEn.toISOString(),
  };
}

export function aDetalle(
  d: PostulacionDatos,
  reloj: Reloj,
  pasos: readonly DatosPaso[] = [],
  postulacionesDePasos: ReadonlyMap<string, Omit<PostulacionDelPaso, 'id'>> = new Map(),
  perfil: PerfilParaRevisar = null,
): VistaDetalle {
  // Del más nuevo al más antiguo; con la misma hora, el que se agregó después va primero.
  const nuevoPrimero = <T>(xs: T[], f: (x: T) => Date) =>
    xs
      .map((x, i) => ({ x, i }))
      .sort((a, b) => f(b.x).getTime() - f(a.x).getTime() || b.i - a.i)
      .map(({ x }) => x);
  return {
    ...aResumen(d, reloj, pasos, perfil),
    aviso: d.aviso,
    canal: d.canal ?? null,
    sueldoPretendido: d.sueldoPretendido ?? null,
    contactos: d.contactos,
    entrevistas: d.entrevistas.map((e) => ({ ...e, fecha: e.fecha.toISOString() })),
    notas: nuevoPrimero(d.notas, (n) => n.creadaEn).map((n) => ({
      ...n,
      creadaEn: n.creadaEn.toISOString(),
    })),
    historial: nuevoPrimero(d.historial, (c) => c.ocurridoEn).map((c) => ({
      ...c,
      ocurridoEn: c.ocurridoEn.toISOString(),
    })),
    senales: nuevoPrimero(d.senales, (s) => s.recibidaEn).map((s) => ({
      ...s,
      recibidaEn: s.recibidaEn.toISOString(),
    })),
    discrepancias: d.discrepancias.map((x) => ({
      ...x,
      detectadaEn: x.detectadaEn.toISOString(),
      resueltaEn: x.resueltaEn?.toISOString() ?? null,
    })),
    pasos: [...pasos]
      .sort((a, b) => a.pedidoEn.getTime() - b.pedidoEn.getTime() || a.id.localeCompare(b.id))
      .map((p) => aVistaPaso(p, postulacionesDePasos, reloj)),
    creadaEn: d.creadaEn.toISOString(),
  };
}

/** Orden de las tarjetas: prioridad, cierre más cercano y última actualización (ui.md §4.2). */
export function ordenarTarjetas(a: VistaResumen, b: VistaResumen): number {
  return (
    PESO[a.prioridad] - PESO[b.prioridad] ||
    (a.diasAlCierre ?? Number.MAX_SAFE_INTEGER) - (b.diasAlCierre ?? Number.MAX_SAFE_INTEGER) ||
    b.actualizadaEn.localeCompare(a.actualizadaEn) ||
    a.id.localeCompare(b.id)
  );
}

export function ordenarPorPrioridad<T extends { prioridad: Prioridad }>(a: T, b: T): number {
  return PESO[a.prioridad] - PESO[b.prioridad];
}
