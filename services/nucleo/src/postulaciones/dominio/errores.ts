import { ErrorDeDominio } from '../../compartido/dominio/error-de-dominio';
import type { EstadoPostulacion } from './estado';

export class TransicionInvalida extends ErrorDeDominio {
  readonly codigo = 'TRANSICION_INVALIDA';
  constructor(
    readonly de: EstadoPostulacion,
    readonly a: EstadoPostulacion,
    mensaje = `No se puede pasar de ${de} a ${a}`,
  ) {
    super(mensaje, 'a');
  }
}

export class AvisoCerrado extends ErrorDeDominio {
  readonly codigo = 'AVISO_CERRADO';
  constructor(mensaje = 'El aviso ya cerró') {
    super(mensaje, 'a');
  }
}

export class DatoInvalido extends ErrorDeDominio {
  readonly codigo = 'VALIDACION';
  constructor(campo: string, mensaje: string) {
    super(mensaje, campo);
  }
}

export class EstadoTerminal extends ErrorDeDominio {
  readonly codigo = 'ESTADO_TERMINAL';
  constructor(mensaje = 'La postulación está en un estado terminal') {
    super(mensaje);
  }
}

export class PostulacionDuplicada extends ErrorDeDominio {
  readonly codigo = 'YA_EXISTE';
  constructor(
    readonly url: string,
    readonly existenteId?: string,
  ) {
    super('Ya sigues este aviso', 'aviso.url');
  }
}

export class SenalDuplicada extends ErrorDeDominio {
  readonly codigo = 'YA_EXISTE';
  constructor(readonly referenciaExterna: string) {
    super('Esta señal ya está registrada', 'referenciaExterna');
  }
}

/** La referencia pasó por la bandeja y no está en las postulaciones pedidas: se lleva con «asociar» (ADR 0015). */
export class SenalEnBandeja extends SenalDuplicada {
  constructor(referenciaExterna: string, senalId?: string) {
    super(referenciaExterna);
    this.message = senalId
      ? `Este correo ya está en la bandeja: asócialo con asociar_senal (senalId ${senalId})`
      : 'Este correo ya pasó por la bandeja y está en otra postulación: revisa a cuál se asoció';
  }
}

export class ConflictoDeVersion extends ErrorDeDominio {
  readonly codigo = 'CONFLICTO';
  constructor() {
    super('La postulación cambió en otro lado', 'version');
  }
}

export class NoEncontrada extends ErrorDeDominio {
  readonly codigo = 'NO_ENCONTRADO';
  constructor(que = 'La postulación') {
    super(`${que} no existe`);
  }
}
