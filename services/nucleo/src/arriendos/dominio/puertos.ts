import type { Busqueda } from './busqueda';
import type { Canal } from './canal';
import type { Propiedad } from './propiedad';

export interface PropiedadRepositorio {
  porId(id: string): Promise<Propiedad | null>;
  /** La propiedad que ya tiene una publicación con esa URL normalizada. */
  porUrlClave(urlClave: string): Promise<Propiedad | null>;
  todas(): Promise<Propiedad[]>;
  /** Guarda con control de versión y publica sus eventos. */
  guardar(p: Propiedad, versionLeida: number | null): Promise<void>;
  borrar(id: string): Promise<void>;
}

export interface CanalRepositorio {
  porId(id: string): Promise<Canal | null>;
  todos(): Promise<Canal[]>;
  guardar(c: Canal): Promise<void>;
}

export interface BusquedaRepositorio {
  leer(): Promise<Busqueda>;
  guardar(b: Busqueda): Promise<void>;
}
