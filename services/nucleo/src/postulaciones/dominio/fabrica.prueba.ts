import type { Deps } from '../../compartido/dominio/puertos';
import type { EstadoPostulacion } from './estado';
import type { AvisoResumen } from './objetos-valor/valores';
import { Postulacion, type PostulacionDatos } from './postulacion';

export const AVISO: AvisoResumen = {
  titulo: 'Backend NestJS',
  empresa: 'Empresa Ficticia',
  url: 'https://ejemplo.test/avisos/1',
  plataforma: 'getonboard',
  modalidad: 'remoto',
  ubicacion: 'Chile',
};

/** Arma una postulación en cualquier estado, como si viniera de la base. */
export function enEstado(
  estado: EstadoPostulacion,
  deps: Deps,
  extra: Partial<PostulacionDatos> = {},
): Postulacion {
  const ahora = deps.reloj.ahora();
  return Postulacion.reconstituir({
    id: deps.ids.nuevo(),
    aviso: AVISO,
    estado,
    fechaPostulacion: '2026-11-10',
    canal: { tipo: 'portal', valor: 'Get on Board' },
    etiquetas: [],
    contactos: [],
    entrevistas: [],
    notas: [],
    historial: [{ id: deps.ids.nuevo(), de: null, a: estado, origen: 'importacion', ocurridoEn: ahora }],
    senales: [],
    discrepancias: [],
    version: 3,
    creadaEn: ahora,
    actualizadaEn: ahora,
    ...extra,
  } as PostulacionDatos);
}
