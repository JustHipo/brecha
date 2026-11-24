import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

/*
 * Cliente de la API de IA (`services/ia`, docs/diseno/f2.md §8). No hay contrato generado para
 * esta API: las interfaces de abajo copian las formas que responde FastAPI (`entradas/api.py`).
 * Si cambian allá, hay que cambiarlas aquí a mano.
 */

export type PlataformaIa =
  | 'linkedin'
  | 'trabajando'
  | 'getonboard'
  | 'computrabajo'
  | 'chiletrabajos'
  | 'indeed'
  | 'sitio_empresa'
  | 'otra';
export type ModalidadIa = 'remoto' | 'hibrido' | 'presencial' | 'no_indica';
export type OrigenAviso = 'importado' | 'getonboard' | 'manual';

export interface Conexiones {
  correo: {
    configurado: boolean;
    ultimaRevision: string | null;
    ultimoError: string | null;
    cadaMinutos: number;
  };
  ia: {
    proveedor: 'openai';
    configurado: boolean;
    modelo: string;
    ultimoError: string | null;
    enCola: number;
    clasificados: number;
    gastoMesUsd: number;
    llamadasMes: number;
  };
  salida: string[];
}

export interface Perfil {
  /** Años de experiencia por herramienta. */
  herramientas: Record<string, number>;
  anosTotales: number;
}

export interface PerfilGuardado extends Perfil {
  /** Cuántos avisos recalcularon su calce con el perfil nuevo. */
  recalculados: number;
}

export interface AvisoIa {
  id: string;
  url: string;
  titulo: string;
  empresa: string;
  plataforma: string;
  modalidad: string;
  ubicacion: string | null;
  origen: OrigenAviso;
  /** De dónde viene el aviso: se muestra siempre junto al enlace (Get on Board lo pide). */
  cita: string | null;
  stack: string[];
  sueldo: string | null;
  publicadoEn: string | null;
  analizado: boolean;
  /** Calce de 0 a 100, o null si todavía no se analiza. */
  calce: number | null;
  brechas: string[];
  postulacionId: string | null;
}

export interface Requisito {
  nombre: string;
  obligatorio: boolean;
  anos: number | null;
}

export interface AvisoIaDetalle extends AvisoIa {
  texto: string;
  cumple: string[];
  requisitos: Requisito[];
}

export interface ConteoAvisos {
  total: number;
  analizados: number;
  conVector: number;
  vinculados: number;
}

export interface ListaAvisos {
  items: AvisoIa[];
  conteo: ConteoAvisos;
}

export interface FiltrosAvisos {
  texto?: string;
  modalidad?: string;
  plataforma?: string;
  calceMinimo?: number | null;
  limite?: number;
}

export interface ResultadoBusqueda {
  encontrados: number;
  nuevos: number;
  error: string | null;
}

export interface AvisoPegado {
  url: string;
  titulo: string;
  empresa: string;
  /** Al menos 20 caracteres. */
  texto: string;
  plataforma?: PlataformaIa;
  modalidad?: ModalidadIa;
  stack?: string[];
}

export interface Respuesta {
  respuesta: string;
  citados: AvisoIa[];
  descartados: number;
  costoUsd: number;
}

/** Qué credenciales hay guardadas. Los secretos nunca vuelven: solo el usuario enmascarado. */
export interface Credenciales {
  correo: { configurado: boolean; usuario: string | null };
  openai: { configurado: boolean };
}

export interface CredencialGuardada {
  configurado: boolean;
  usuario?: string | null;
}

export type TipoDeCredencial = 'correo' | 'openai';

export const BASE_IA = '/api/ia';

/** Cliente delgado de la API de IA. Usa el mismo token que el núcleo (la API lo verifica allá). */
@Injectable({ providedIn: 'root' })
export class Ia {
  private readonly http = inject(HttpClient);

  conexiones() {
    return this.http.get<Conexiones>(`${BASE_IA}/conexiones`);
  }

  // Credenciales (Ajustes): la API las prueba antes de guardarlas y nunca las devuelve.
  credenciales() {
    return this.http.get<Credenciales>(`${BASE_IA}/credenciales`);
  }
  guardarCorreo(usuario: string, clave: string) {
    return this.http.put<CredencialGuardada>(`${BASE_IA}/credenciales/correo`, { usuario, clave });
  }
  guardarOpenai(llave: string) {
    return this.http.put<CredencialGuardada>(`${BASE_IA}/credenciales/openai`, { llave });
  }
  borrarCredencial(tipo: TipoDeCredencial) {
    return this.http.delete<void>(`${BASE_IA}/credenciales/${tipo}`);
  }

  perfil() {
    return this.http.get<Perfil>(`${BASE_IA}/perfil`);
  }
  guardarPerfil(perfil: Perfil) {
    return this.http.put<PerfilGuardado>(`${BASE_IA}/perfil`, perfil);
  }

  avisos(f: FiltrosAvisos = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || v === null || v === '') continue;
      params = params.set(k, String(v));
    }
    return this.http.get<ListaAvisos>(`${BASE_IA}/avisos`, { params });
  }
  aviso(id: string) {
    return this.http.get<AvisoIaDetalle>(`${BASE_IA}/avisos/${encodeURIComponent(id)}`);
  }
  pegarAviso(cuerpo: AvisoPegado) {
    return this.http.post<AvisoIaDetalle>(`${BASE_IA}/avisos`, cuerpo);
  }
  buscarEnGetOnBoard(consulta: string, maximo?: number) {
    return this.http.post<ResultadoBusqueda>(`${BASE_IA}/avisos/buscar`, {
      consulta,
      ...(maximo ? { maximo } : {}),
    });
  }
  vincular(id: string, postulacionId: string) {
    return this.http.post<AvisoIaDetalle>(`${BASE_IA}/avisos/${encodeURIComponent(id)}/vincular`, {
      postulacionId,
    });
  }

  preguntar(pregunta: string) {
    return this.http.post<Respuesta>(`${BASE_IA}/preguntas`, { pregunta });
  }
}
