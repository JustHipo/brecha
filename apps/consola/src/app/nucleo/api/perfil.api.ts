import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { components } from '@brecha/contratos';

type E = components['schemas'];
export type PerfilEmpleo = E['PerfilEmpleoDto'];
export type ReglaDePerfil = E['ReglaDePerfilDto'];
export type ReglaDePerfilEntrada = E['ReglaDePerfilEntradaDto'];
export type CambiarPerfil = E['CambiarPerfilDto'];
export type CriterioDeEmpleo = E['CriterioDeEmpleo'];
export type RevisionDePerfil = E['RevisionDePerfilDto'];

/** Perfil de búsqueda de Empleo (docs/diseno/perfil.md §3.3). El de Arriendos va por `ApiArriendos.busqueda`. */
@Injectable({ providedIn: 'root' })
export class ApiPerfil {
  private readonly http = inject(HttpClient);

  ver() {
    return this.http.get<PerfilEmpleo>('/api/v1/perfil');
  }
  cambiar(cuerpo: CambiarPerfil) {
    return this.http.put<PerfilEmpleo>('/api/v1/perfil', cuerpo);
  }
}
