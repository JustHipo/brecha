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

export interface FiltrosLista {
  estado?: string[];
  plataforma?: string[];
  prioridad?: string[];
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
  importar(exportArtifact: object) {
    return this.http.post<ResultadoImportacion>(`${BASE}/postulaciones/importar`, exportArtifact);
  }
}
