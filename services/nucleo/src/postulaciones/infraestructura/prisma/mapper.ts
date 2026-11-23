import type { Fecha } from '../../../compartido/dominio/puertos';
import type { EstadoPostulacion } from '../../dominio/estado';
import type { Dinero, Modalidad, Origen, Plataforma, TipoDeCanal } from '../../dominio/objetos-valor/valores';
import type {
  CambioDeEstado,
  Discrepancia,
  Entrevista,
  FuenteDeSenal,
  ReglaDeDiscrepancia,
  ResultadoDeEntrevista,
  Senal,
  TipoDeEntrevista,
} from '../../dominio/partes';
import type { PostulacionDatos } from '../../dominio/postulacion';
import { esTerminal } from '../../dominio/estado';
import type { Prisma } from '../../../compartido/infraestructura/prisma';

type FilaCompleta = Prisma.PostulacionGetPayload<{
  include: {
    cambios: true;
    senales: true;
    discrepancias: true;
    entrevistas: true;
    contactos: true;
    notas: true;
  };
}>;

export const INCLUIR_TODO = {
  cambios: { orderBy: { ocurridoEn: 'asc' } },
  senales: { orderBy: { recibidaEn: 'asc' } },
  discrepancias: { orderBy: { detectadaEn: 'asc' } },
  entrevistas: { orderBy: { fecha: 'asc' } },
  contactos: true,
  notas: { orderBy: { creadaEn: 'asc' } },
} as const;

export const aFecha = (d: Date): Fecha => d.toISOString().slice(0, 10);
export const deFecha = (f: Fecha): Date => new Date(`${f}T00:00:00Z`);
const sinNull = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export function filaADatos(f: FilaCompleta): PostulacionDatos {
  return {
    id: f.id,
    aviso: {
      titulo: f.avisoTitulo,
      empresa: f.avisoEmpresa,
      url: f.avisoUrl,
      plataforma: f.avisoPlataforma as Plataforma,
      modalidad: f.avisoModalidad as Modalidad,
      ubicacion: f.avisoUbicacion,
      ...(f.avisoCierre ? { cierre: aFecha(f.avisoCierre) } : {}),
      ...(f.avisoIdMercado ? { avisoId: f.avisoIdMercado } : {}),
      ...(f.avisoCalce !== null ? { calce: Number(f.avisoCalce) } : {}),
    },
    estado: f.estado as EstadoPostulacion,
    ...(f.canalTipo && f.canalValor
      ? { canal: { tipo: f.canalTipo as TipoDeCanal, valor: f.canalValor } }
      : {}),
    ...(f.fechaPostulacion ? { fechaPostulacion: aFecha(f.fechaPostulacion) } : {}),
    ...(f.sueldoMonto !== null && f.sueldoMoneda
      ? {
          sueldoPretendido: {
            monto: Number(f.sueldoMonto),
            moneda: f.sueldoMoneda as Dinero['moneda'],
            periodo: (f.sueldoPeriodo ?? 'mes') as Dinero['periodo'],
            base: (f.sueldoBase ?? 'bruto') as Dinero['base'],
          },
        }
      : {}),
    contactos: f.contactos.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      ...(c.rol ? { rol: c.rol } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(c.linkedin ? { linkedin: c.linkedin } : {}),
    })),
    entrevistas: f.entrevistas.map((e): Entrevista => ({
      id: e.id,
      fecha: e.fecha,
      tipo: e.tipo as TipoDeEntrevista,
      ...(e.con ? { con: e.con } : {}),
      resultado: e.resultado as ResultadoDeEntrevista,
    })),
    notas: f.notas.map((n) => ({ id: n.id, texto: n.texto, creadaEn: n.creadaEn })),
    historial: f.cambios.map((c): CambioDeEstado => ({
      id: c.id,
      de: c.de as EstadoPostulacion | null,
      a: c.a as EstadoPostulacion,
      ...(c.motivo ? { motivo: c.motivo } : {}),
      origen: c.origen as Origen,
      ocurridoEn: c.ocurridoEn,
    })),
    senales: f.senales.map((s): Senal => ({
      id: s.id,
      fuente: s.fuente as FuenteDeSenal,
      plataforma: s.plataforma as Plataforma,
      resumen: s.resumen,
      ...(s.estadoSugerido ? { estadoSugerido: s.estadoSugerido as EstadoPostulacion } : {}),
      confianza: Number(s.confianza),
      recibidaEn: s.recibidaEn,
      ...(s.referenciaExterna ? { referenciaExterna: s.referenciaExterna } : {}),
      aplicada: s.aplicada,
    })),
    discrepancias: f.discrepancias.map((d): Discrepancia => ({
      id: d.id,
      cambioId: d.cambioEstadoId,
      ...(d.senalId ? { senalId: d.senalId } : {}),
      regla: d.regla as ReglaDeDiscrepancia,
      severidad: d.severidad as Discrepancia['severidad'],
      detalle: d.detalle,
      estado: d.estado as Discrepancia['estado'],
      detectadaEn: d.detectadaEn,
      ...(sinNull(d.resueltaEn) ? { resueltaEn: d.resueltaEn! } : {}),
    })),
    version: f.version,
    creadaEn: f.creadaEn,
    actualizadaEn: f.actualizadaEn,
  };
}

/** Columnas propias de la fila `postulacion` (sin hijos ni versión). */
export function datosAFila(d: PostulacionDatos) {
  return {
    avisoTitulo: d.aviso.titulo,
    avisoEmpresa: d.aviso.empresa,
    avisoUrl: d.aviso.url,
    avisoPlataforma: d.aviso.plataforma,
    avisoModalidad: d.aviso.modalidad,
    avisoUbicacion: d.aviso.ubicacion,
    avisoCierre: d.aviso.cierre ? deFecha(d.aviso.cierre) : null,
    avisoIdMercado: d.aviso.avisoId ?? null,
    avisoCalce: d.aviso.calce ?? null,
    estado: d.estado,
    canalTipo: d.canal?.tipo ?? null,
    canalValor: d.canal?.valor ?? null,
    fechaPostulacion: d.fechaPostulacion ? deFecha(d.fechaPostulacion) : null,
    sueldoMonto: d.sueldoPretendido?.monto ?? null,
    sueldoMoneda: d.sueldoPretendido?.moneda ?? null,
    sueldoPeriodo: d.sueldoPretendido?.periodo ?? null,
    sueldoBase: d.sueldoPretendido?.base ?? null,
    avisoUrlActiva: esTerminal(d.estado) ? null : d.aviso.url,
    actualizadaEn: d.actualizadaEn,
  };
}

export const cambioAFila = (postulacionId: string, c: CambioDeEstado) => ({
  id: c.id,
  postulacionId,
  de: c.de,
  a: c.a,
  motivo: c.motivo ?? null,
  origen: c.origen,
  ocurridoEn: c.ocurridoEn,
});

export const senalAFila = (postulacionId: string, s: Senal) => ({
  id: s.id,
  postulacionId,
  fuente: s.fuente,
  plataforma: s.plataforma,
  resumen: s.resumen,
  estadoSugerido: s.estadoSugerido ?? null,
  confianza: s.confianza,
  referenciaExterna: s.referenciaExterna ?? null,
  recibidaEn: s.recibidaEn,
  aplicada: s.aplicada,
});

export const discrepanciaAFila = (postulacionId: string, d: Discrepancia) => ({
  id: d.id,
  postulacionId,
  cambioEstadoId: d.cambioId,
  senalId: d.senalId ?? null,
  regla: d.regla,
  severidad: d.severidad,
  detalle: d.detalle,
  estado: d.estado,
  detectadaEn: d.detectadaEn,
  resueltaEn: d.resueltaEn ?? null,
});
