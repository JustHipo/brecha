/** Tipos de los eventos de dominio (PLAN §11.5). */
export const EVENTOS = {
  creada: 'postulacion.creada',
  estadoCambiado: 'postulacion.estado_cambiado',
  entrevistaAgendada: 'postulacion.entrevista_agendada',
  senalRegistrada: 'postulacion.senal_registrada',
  discrepanciaDetectada: 'postulacion.discrepancia_detectada',
  discrepanciaResuelta: 'postulacion.discrepancia_resuelta',
  cierreProximo: 'postulacion.cierre_proximo',
} as const;
