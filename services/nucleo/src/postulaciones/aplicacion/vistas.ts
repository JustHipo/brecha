import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import { diasEntre, type Fecha, type Reloj } from '../../compartido/dominio/puertos';
import { destinosDe, type EstadoPostulacion } from '../dominio/estado';
import type { AvisoResumen, Canal, Contacto, Dinero } from '../dominio/objetos-valor/valores';
import type { CambioDeEstado, Discrepancia, Entrevista, Nota, Senal } from '../dominio/partes';
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
  fechaPostulacion: Fecha | null;
  senalesNuevas: number;
  discrepanciasAbiertas: number;
  transicionesPosibles: EstadoPostulacion[];
  version: number;
  actualizadaEn: string;
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
  tipo: 'cambio' | 'senal' | 'discrepancia' | 'nota';
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

export function aResumen(d: PostulacionDatos, reloj: Reloj): VistaResumen {
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
    prioridad: calcularPrioridad(d.estado, d.aviso.cierre, reloj.hoy()),
    fechaPostulacion: d.fechaPostulacion ?? null,
    senalesNuevas: d.senales.filter((s) => !s.aplicada).length,
    discrepanciasAbiertas: d.discrepancias.filter((x) => x.estado === 'abierta').length,
    transicionesPosibles: transicionesPosibles(d.estado, d.aviso.cierre, reloj),
    version: d.version,
    actualizadaEn: d.actualizadaEn.toISOString(),
  };
}

export function aDetalle(d: PostulacionDatos, reloj: Reloj): VistaDetalle {
  // Del más nuevo al más antiguo; con la misma hora, el que se agregó después va primero.
  const nuevoPrimero = <T>(xs: T[], f: (x: T) => Date) =>
    xs
      .map((x, i) => ({ x, i }))
      .sort((a, b) => f(b.x).getTime() - f(a.x).getTime() || b.i - a.i)
      .map(({ x }) => x);
  return {
    ...aResumen(d, reloj),
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
