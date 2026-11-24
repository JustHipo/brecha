import { DatoInvalido } from '../../postulaciones/dominio/errores';
import { CasosDeRed } from '../aplicacion/casos-de-red';

/** Los casos de la red para Nest (token de inyección por clase). */
export class CasosDeRedInyectables {
  constructor(readonly red: CasosDeRed) {}
  validacion(campo: string, mensaje: string): never {
    throw new DatoInvalido(campo, mensaje);
  }
}
