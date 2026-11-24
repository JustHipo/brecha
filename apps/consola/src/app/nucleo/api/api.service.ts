import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ContactoEntrada,
  CrearPostulacion,
  Detalle,
  EditarPostulacion,
  EntrevistaEntrada,
  ListaPostulaciones,
  ResolverDiscrepancia,
  SenalEntrada,
  Tablero,
  Transicion,
  components,
} from '@brecha/contratos';

type Esquemas = components['schemas'];
export type EstadoAcceso = Esquemas['EstadoAccesoDto'];
export type Sesion = Esquemas['SesionDto'];
export type SenalRegistrada = Esquemas['SenalRegistradaDto'];
export type ResultadoImportacion = Esquemas['ResultadoImportacionDto'];
export type SenalPendiente = Esquemas['SenalPendienteDto'];
export type AvisoEntrada = Esquemas['AvisoEntradaDto'];
// Red de LinkedIn (F2): personas, solicitudes y mensajes ligados a tus postulaciones.
export type ContactoRed = Esquemas['ContactoRedDto'];
export type ContactoRedDetalle = Esquemas['ContactoRedDetalleDto'];
export type ContactoRedRegistrado = Esquemas['ContactoRedRegistradoDto'];
export type ListaDeRed = Esquemas['ListaDeRedDto'];
export type ResumenDeRed = Esquemas['ResumenDeRedDto'];
export type InteraccionRed = Esquemas['InteraccionDto'];
export type TipoDeInteraccion = Esquemas['TipoDeInteraccion'];
export type EstadoDeConexion = Esquemas['EstadoDeConexion'];
export type ContactoRedEntrada = Esquemas['ContactoRedEntradaDto'];
export type EditarContactoRed = Esquemas['EditarContactoRedDto'];
export type InteraccionEntrada = Esquemas['InteraccionEntradaDto'];
// CSV (docs/diseno/csv.md): importar, exportar y plantillas.
export type ResultadoCsv = Esquemas['ResultadoCsvDto'];
export type FilaImportada = Esquemas['FilaImportadaDto'];
export type TipoCsv = Esquemas['TipoCsv'];
export type EtiquetaEnUso = Esquemas['EtiquetaEnUsoDto'];
// Pasos pendientes (docs/diseno/pasos.md): lo que cada postulación te pide hacer.
export type Paso = Esquemas['PasoDto'];
export type PasoCorto = Esquemas['PasoCortoDto'];
export type PasoRegistrado = Esquemas['PasoRegistradoDto'];
export type RegistrarPaso = Esquemas['RegistrarPasoDto'];
export type EditarPaso = Esquemas['EditarPasoDto'];
export type EstadoDePaso = Esquemas['EstadoDePaso'];
export type FiltroDeRed = 'todos' | 'responder' | 'esperando' | 'solicitudes' | 'seguimiento';

export interface ConsultaDeRed {
  filtro?: FiltroDeRed;
  texto?: string;
  postulacionId?: string;
}

export interface FiltrosLista {
  estado?: string[];
  plataforma?: string[];
  prioridad?: string[];
  etiqueta?: string[];
  q?: string;
  limit?: number;
  offset?: number;
}

const BASE = '/api/v1';

/**
 * Cliente delgado del núcleo. Los tipos salen de `@brecha/contratos` (generados del OpenAPI):
 * si el contrato cambia, la consola no compila (ADR 0006).
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  estadoAcceso() {
    return this.http.get<EstadoAcceso>(`${BASE}/acceso/estado`);
  }
  desbloquear(clave: string) {
    return this.http.post<Sesion>(`${BASE}/acceso/desbloquear`, { clave });
  }

  tablero() {
    return this.http.get<Tablero>(`${BASE}/postulaciones/tablero`);
  }
  listar(f: FiltrosLista) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
      params = params.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    return this.http.get<ListaPostulaciones>(`${BASE}/postulaciones`, { params });
  }
  ver(id: string) {
    return this.http.get<Detalle>(`${BASE}/postulaciones/${id}`);
  }
  crear(cuerpo: CrearPostulacion) {
    return this.http.post<Detalle>(`${BASE}/postulaciones`, cuerpo);
  }
  editar(id: string, cuerpo: EditarPostulacion) {
    return this.http.patch<Detalle>(`${BASE}/postulaciones/${id}`, cuerpo);
  }
  cambiarEstado(id: string, cuerpo: Transicion) {
    return this.http.post<Detalle>(`${BASE}/postulaciones/${id}/transiciones`, cuerpo);
  }
  agregarNota(id: string, texto: string) {
    return this.http.post<Detalle>(`${BASE}/postulaciones/${id}/notas`, { texto });
  }
  agregarContacto(id: string, cuerpo: ContactoEntrada) {
    return this.http.post<Detalle>(`${BASE}/postulaciones/${id}/contactos`, cuerpo);
  }
  agendarEntrevista(id: string, cuerpo: EntrevistaEntrada) {
    return this.http.post<Detalle>(`${BASE}/postulaciones/${id}/entrevistas`, cuerpo);
  }
  registrarResultado(
    id: string,
    entrevistaId: string,
    resultado: Esquemas['ResultadoEntrevistaDto']['resultado'],
  ) {
    return this.http.patch<Detalle>(`${BASE}/postulaciones/${id}/entrevistas/${entrevistaId}`, {
      resultado,
    });
  }
  registrarSenal(id: string, cuerpo: SenalEntrada) {
    return this.http.post<SenalRegistrada>(`${BASE}/postulaciones/${id}/senales`, cuerpo);
  }
  aplicarSenal(id: string, senalId: string, version?: number) {
    return this.http.post<Detalle>(
      `${BASE}/postulaciones/${id}/senales/${senalId}/aplicar`,
      version === undefined ? {} : { version },
    );
  }
  resolverDiscrepancia(id: string, discrepanciaId: string, cuerpo: ResolverDiscrepancia) {
    return this.http.post<Detalle>(
      `${BASE}/postulaciones/${id}/discrepancias/${discrepanciaId}/resolver`,
      cuerpo,
    );
  }
  // Bandeja (F2): señales que llegaron sin postulación.
  bandeja() {
    return this.http.get<SenalPendiente[]>(`${BASE}/bandeja`);
  }
  /** A una o varias postulaciones: si el correo pidió algo, el paso queda ligado a todas. */
  asociarSenal(senalId: string, postulacionIds: string[]) {
    return this.http.post<Detalle>(`${BASE}/bandeja/${senalId}/asociar`, { postulacionIds });
  }
  crearDesdeSenal(senalId: string, aviso: AvisoEntrada) {
    return this.http.post<Detalle>(`${BASE}/bandeja/${senalId}/crear`, { aviso });
  }
  descartarSenal(senalId: string) {
    return this.http.post<SenalPendiente>(`${BASE}/bandeja/${senalId}/descartar`, {});
  }

  // Red (F2): LinkedIn no tiene API; la consola y la IA (por MCP) registran lo que pasa.
  red(c: ConsultaDeRed = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(c)) {
      if (v === undefined || v === '' || (k === 'filtro' && v === 'todos')) continue;
      params = params.set(k, String(v));
    }
    return this.http.get<ListaDeRed>(`${BASE}/red`, { params });
  }
  verContactoRed(id: string) {
    return this.http.get<ContactoRedDetalle>(`${BASE}/red/${id}`);
  }
  registrarContactoRed(cuerpo: ContactoRedEntrada) {
    return this.http.post<ContactoRedRegistrado>(`${BASE}/red`, cuerpo);
  }
  editarContactoRed(id: string, cuerpo: EditarContactoRed) {
    return this.http.patch<ContactoRedDetalle>(`${BASE}/red/${id}`, cuerpo);
  }
  registrarInteraccionRed(id: string, cuerpo: InteraccionEntrada) {
    return this.http.post<ContactoRedRegistrado>(`${BASE}/red/${id}/interacciones`, cuerpo);
  }

  // Pasos pendientes (docs/diseno/pasos.md §8).
  pasos(f: { estado?: EstadoDePaso; postulacionId?: string } = {}) {
    let params = new HttpParams();
    if (f.estado) params = params.set('estado', f.estado);
    if (f.postulacionId) params = params.set('postulacionId', f.postulacionId);
    return this.http.get<Paso[]>(`${BASE}/pasos`, { params });
  }
  registrarPaso(cuerpo: RegistrarPaso) {
    return this.http.post<PasoRegistrado>(`${BASE}/pasos`, cuerpo);
  }
  editarPaso(id: string, cuerpo: EditarPaso) {
    return this.http.patch<Paso>(`${BASE}/pasos/${id}`, cuerpo);
  }
  /** Hecho, descartado o `pendiente` para reabrir. Sin versión: el último cambio gana. */
  resolverPaso(id: string, estado: EstadoDePaso, nota?: string) {
    return this.http.post<Paso>(
      `${BASE}/pasos/${id}/resolver`,
      nota ? { estado, nota } : { estado },
    );
  }

  etiquetas() {
    return this.http.get<EtiquetaEnUso[]>(`${BASE}/postulaciones/etiquetas`);
  }
  importarCsv(csv: string, tipo?: TipoCsv) {
    return this.http.post<ResultadoCsv>(`${BASE}/csv/importar`, tipo ? { csv, tipo } : { csv });
  }
  /** El archivo de una exportación o una plantilla, para guardarlo con `guardarArchivo`. */
  descargarCsv(ruta: `exportar/${TipoCsv}` | `plantillas/${TipoCsv}`) {
    return this.http.get(`${BASE}/csv/${ruta}`, { responseType: 'blob', observe: 'response' });
  }

  importar(exportArtifact: object) {
    return this.http.post<ResultadoImportacion>(`${BASE}/postulaciones/importar`, exportArtifact);
  }
}
