import { ErrorDeDominio } from '../compartido/dominio/error-de-dominio';

export class NoAutenticado extends ErrorDeDominio {
  readonly codigo = 'NO_AUTENTICADO';
  constructor(mensaje = 'Hace falta un token válido') {
    super(mensaje);
  }
}

export class ClaveInvalida extends ErrorDeDominio {
  readonly codigo = 'CLAVE_INVALIDA';
  constructor() {
    super('La clave no es correcta', 'clave');
  }
}
