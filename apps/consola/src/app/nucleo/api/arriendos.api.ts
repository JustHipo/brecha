import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { components } from '@brecha/contratos';

type E = components['schemas'];
export type Propiedad = E['PropiedadDto'];
export type PropiedadDetalle = E['PropiedadDetalleDto'];
export type ListaPropiedades = E['ListaPropiedadesDto'];
export type ResumenArriendos = E['ResumenArriendosDto'];
export type PropiedadCreada = E['PropiedadCreadaDto'];
export type Duplicados = E['DuplicadosDto'];
export type EstadoPropiedad = E['EstadoPropiedad'];
export type TipoDePropiedad = E['TipoDePropiedad'];
export type CrearPropiedad = E['CrearPropiedadDto'];
export type EditarPropiedad = E['EditarPropiedadDto'];
export type ContactoPropiedadEntrada = E['ContactoPropiedadEntradaDto'];
export type ContactoPropiedad = E['ContactoPropiedadDto'];
export type InteraccionArriendoEntrada = E['InteraccionArriendoEntradaDto'];
export type SenalArriendoPendiente = E['SenalArriendoPendienteDto'];
export type Canal = E['CanalArriendoDto'];
export type CanalEntrada = E['CanalArriendoEntradaDto'];
export type EditarCanal = E['EditarCanalArriendoDto'];
export type Busqueda = E['BusquedaDto'];
export type Regla = E['ReglaDto'];
export type ReglaEntrada = E['ReglaEntradaDto'];
export type CambiarBusqueda = E['CambiarBusquedaDto'];
export type CriterioDeBusqueda = E['CriterioDeBusqueda'];
export type MapaArriendos = E['MapaArriendosDto'];
export type CambiarEstadoPropiedad = E['CambiarEstadoPropiedadDto'];

const BASE = '/api/v1/arriendos';

export interface FiltrosArriendos {
  estado?: string;
  texto?: string;
  canal?: string;
  abiertas?: boolean;
  pendiente?: string;
}

/** Cliente del contexto Arriendos del núcleo (docs/diseno/arriendos.md). Tipos del contrato OpenAPI. */
@Injectable({ providedIn: 'root' })
export class ApiArriendos {
  private readonly http = inject(HttpClient);

  listar(f: FiltrosArriendos = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(f))
      if (v !== undefined && v !== '' && v !== false) params = params.set(k, String(v));
    return this.http.get<ListaPropiedades>(`${BASE}/propiedades`, { params });
  }
  ver(id: string) {
    return this.http.get<PropiedadDetalle>(`${BASE}/propiedades/${id}`);
  }
  crear(cuerpo: CrearPropiedad) {
    return this.http.post<PropiedadCreada>(`${BASE}/propiedades`, cuerpo);
  }
  duplicados(q: { url?: string; direccion?: string; comuna?: string; dormitorios?: number }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q))
      if (v !== undefined && v !== '') params = params.set(k, String(v));
    return this.http.get<Duplicados>(`${BASE}/propiedades/duplicados`, { params });
  }
  editar(id: string, cuerpo: EditarPropiedad) {
    return this.http.patch<PropiedadDetalle>(`${BASE}/propiedades/${id}`, cuerpo);
  }
  borrar(id: string) {
    return this.http.delete<void>(`${BASE}/propiedades/${id}`);
  }
  cambiarEstado(id: string, cuerpo: CambiarEstadoPropiedad) {
    return this.http.post<PropiedadDetalle>(`${BASE}/propiedades/${id}/estado`, cuerpo);
  }
  agregarPublicacion(id: string, cuerpo: { canalId?: string; url?: string }) {
    return this.http.post<PropiedadDetalle>(`${BASE}/propiedades/${id}/publicaciones`, cuerpo);
  }
  unir(destinoId: string, origenId: string) {
    return this.http.post<PropiedadDetalle>(`${BASE}/propiedades/${destinoId}/unir`, { origenId });
  }
  registrarContacto(id: string, cuerpo: ContactoPropiedadEntrada) {
    return this.http.post<E['ContactoRegistradoDto']>(
      `${BASE}/propiedades/${id}/contactos`,
      cuerpo,
    );
  }
  quitarContacto(id: string, contactoId: string) {
    return this.http.delete<PropiedadDetalle>(`${BASE}/propiedades/${id}/contactos/${contactoId}`);
  }
  registrarInteraccion(id: string, cuerpo: InteraccionArriendoEntrada) {
    return this.http.post<E['InteraccionRegistradaDto']>(
      `${BASE}/propiedades/${id}/interacciones`,
      cuerpo,
    );
  }
  agendarVisita(id: string, cuerpo: { fecha: string; notas?: string }) {
    return this.http.post<PropiedadDetalle>(`${BASE}/propiedades/${id}/visitas`, cuerpo);
  }
  cambiarVisita(id: string, visitaId: string, estado: 'agendada' | 'hecha' | 'cancelada') {
    return this.http.patch<PropiedadDetalle>(`${BASE}/propiedades/${id}/visitas/${visitaId}`, {
      estado,
    });
  }
  agregarNota(id: string, texto: string) {
    return this.http.post<PropiedadDetalle>(`${BASE}/propiedades/${id}/notas`, { texto });
  }
  resolverDiscrepancia(id: string, discrepanciaId: string) {
    return this.http.post<PropiedadDetalle>(
      `${BASE}/propiedades/${id}/discrepancias/${discrepanciaId}/resolver`,
      {},
    );
  }
  aplicarSenal(id: string, senalId: string) {
    return this.http.post<PropiedadDetalle>(
      `${BASE}/propiedades/${id}/senales/${senalId}/aplicar`,
      {},
    );
  }
  fijarUbicacion(id: string, lat: number, lon: number) {
    return this.http.put<PropiedadDetalle>(`${BASE}/propiedades/${id}/ubicacion`, { lat, lon });
  }
  bandeja() {
    return this.http.get<SenalArriendoPendiente[]>(`${BASE}/bandeja`);
  }
  asociar(senalId: string, propiedadId: string) {
    return this.http.post<PropiedadDetalle>(`${BASE}/bandeja/${senalId}/asociar`, { propiedadId });
  }
  descartar(senalId: string) {
    return this.http.post<void>(`${BASE}/bandeja/${senalId}/descartar`, {});
  }
  canales() {
    return this.http.get<Canal[]>(`${BASE}/canales`);
  }
  registrarCanal(cuerpo: CanalEntrada) {
    return this.http.post<Canal>(`${BASE}/canales`, cuerpo);
  }
  editarCanal(id: string, cuerpo: EditarCanal) {
    return this.http.patch<Canal>(`${BASE}/canales/${id}`, cuerpo);
  }
  busqueda() {
    return this.http.get<Busqueda>(`${BASE}/busqueda`);
  }
  cambiarBusqueda(cuerpo: CambiarBusqueda) {
    return this.http.put<Busqueda>(`${BASE}/busqueda`, cuerpo);
  }
  fijarUf(valor: number, fecha: string) {
    return this.http.put<void>(`${BASE}/uf`, { valor, fecha });
  }
  mapa() {
    return this.http.get<MapaArriendos>(`${BASE}/mapa`);
  }
  ubicarPendientes() {
    return this.http.post<E['UbicarPendientesDto']>(`${BASE}/mapa/ubicar`, {});
  }
  fijarGeocodificar(activo: boolean) {
    return this.http.put<void>(`${BASE}/geocodificar`, { activo });
  }
}

// ── Servicio con IA: importar y preguntar (sin contrato generado: copia de services/ia/entradas/api.py) ──

export interface PropuestaArriendo {
  titulo: string | null;
  tipo: TipoDePropiedad;
  direccion: string | null;
  comuna: string | null;
  precio: { monto: number; moneda: 'CLP' | 'UF' } | null;
  gastosComunes: number | null;
  dormitorios: number | null;
  banos: number | null;
  m2: number | null;
  estacionamientos: number | null;
  mascotas: boolean | null;
  amoblado: boolean | null;
  url: string | null;
  requisitos: { rentaVeces: number | null; aval: boolean | null; mesesGarantia: number | null };
  estadoSugerido: EstadoPropiedad | null;
  contacto: {
    nombre: string | null;
    telefono: string | null;
    correo: string | null;
    rol: 'corredor' | 'dueno' | 'conserje' | 'administracion' | 'otro' | null;
  } | null;
  nota: string | null;
  mensajes: number[];
}

export interface MensajeDeChat {
  indice: number;
  fecha: string;
  autor: string;
  texto: string;
  tuyo: boolean;
}

export interface Extraccion {
  propuestas: PropuestaArriendo[];
  mensajes: MensajeDeChat[];
  recortado: boolean;
  costoUsd: number;
}

export interface ChatLeido {
  autores: string[];
  mensajes: number;
  desde: string;
  hasta: string;
}

export interface RespuestaArriendos {
  respuesta: string;
  citados: { id: string; titulo: string; estado: EstadoPropiedad; comuna: string | null }[];
  descartados: number;
  costoUsd: number;
}

/** Cliente de las rutas de Arriendos del servicio con IA. */
@Injectable({ providedIn: 'root' })
export class IaArriendos {
  private readonly http = inject(HttpClient);
  leerChat(chat: string) {
    return this.http.post<ChatLeido>('/api/ia/arriendos/chat', { chat });
  }
  extraer(cuerpo: { texto: string } | { chat: string; yo: string | null }) {
    return this.http.post<Extraccion>('/api/ia/arriendos/extraer', cuerpo);
  }
  preguntar(pregunta: string) {
    return this.http.post<RespuestaArriendos>('/api/ia/arriendos/preguntas', { pregunta });
  }
}
