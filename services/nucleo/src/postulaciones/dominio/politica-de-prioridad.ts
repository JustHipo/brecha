import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import { diasEntre, type Fecha } from '../../compartido/dominio/puertos';
import type { EstadoPostulacion } from './estado';

/** R12: la prioridad no se guarda, se calcula a partir del estado y del cierre del aviso. */
export function calcularPrioridad(
  estado: EstadoPostulacion,
  cierre: Fecha | undefined,
  hoy: Fecha,
): Prioridad {
  switch (estado) {
    case 'postulado':
    case 'en_proceso':
    case 'entrevista':
    case 'oferta':
      return 'alta';
    case 'sin_decidir':
    case 'por_postular': {
      if (cierre === undefined) return 'media';
      const dias = diasEntre(hoy, cierre);
      return dias >= 0 && dias <= 2 ? 'alta' : 'media';
    }
    case 'descartado':
    case 'rechazado':
    case 'aceptada':
      return 'baja';
  }
}
