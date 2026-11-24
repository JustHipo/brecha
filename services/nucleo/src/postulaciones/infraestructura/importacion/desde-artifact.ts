import { DatoInvalido } from '../../dominio/errores';
import { esEstado, esDeAvance, type EstadoPostulacion } from '../../dominio/estado';
import { esFecha } from '../../../compartido/dominio/puertos';
import { plataformaDesdeUrl, type Plataforma } from '../../dominio/objetos-valor/valores';

export { plataformaDesdeUrl };
import type { FichaImportable } from '../../aplicacion/importar-fichas';

/**
 * Adaptador del export del artifact de seguimiento anterior: `{ fichas: [...], estados: { [id]: {...} } }`.
 * `fichas` trae el aviso y el estado inicial; `estados` el estado guardado después (manda sobre el inicial).
 * El formato está documentado en `datos/ejemplo/artifact-export.json` (datos inventados).
 */
interface FichaArtifact {
  id: string;
  titulo?: string;
  empresa?: string;
  aviso?: string;
  sitio?: string;
  modalidad?: string;
  ubicacion?: string;
  estado_inicial?: string;
  fecha_inicial?: string;
}
interface EstadoArtifact {
  estado?: string;
  fecha?: string;
  nota?: string;
  aviso?: string;
  empresa?: string;
  titulo?: string;
}
export interface ExportArtifact {
  fichas: FichaArtifact[];
  estados?: Record<string, EstadoArtifact>;
}

const SITIOS: Record<string, Plataforma> = {
  trabajando: 'trabajando',
  getonbrd: 'getonboard',
  getonboard: 'getonboard',
  linkedin: 'linkedin',
  chiletrabajos: 'chiletrabajos',
  computrabajo: 'computrabajo',
  indeed: 'indeed',
  empresa: 'sitio_empresa',
};
const NOMBRES: Record<Plataforma, string> = {
  linkedin: 'LinkedIn',
  trabajando: 'trabajando.com',
  getonboard: 'Get on Board',
  computrabajo: 'Computrabajo',
  chiletrabajos: 'Chiletrabajos',
  indeed: 'Indeed',
  sitio_empresa: 'Sitio de la empresa',
  otra: 'Otra',
};

export function modalidadDesdeTexto(texto: string | undefined): string {
  const t = (texto ?? '').toLowerCase();
  if (t.startsWith('remot')) return 'remoto';
  if (t.startsWith('híbrid') || t.startsWith('hibrid')) return 'hibrido';
  if (t.startsWith('presencial')) return 'presencial';
  return 'no_indica';
}

export function fichasDesdeArtifact(exp: ExportArtifact): FichaImportable[] {
  if (!exp || !Array.isArray(exp.fichas))
    throw new DatoInvalido('fichas', 'El archivo no tiene la lista `fichas`');
  const estados = exp.estados ?? {};
  const porId = new Map(exp.fichas.map((f) => [f.id, f]));
  const ids = [...new Set([...exp.fichas.map((f) => f.id), ...Object.keys(estados)])];

  return ids.map((id): FichaImportable => {
    const f = porId.get(id) ?? ({ id } as FichaArtifact);
    const e = estados[id] ?? {};
    const url = (e.aviso || f.aviso || '').trim();
    const plataforma = (f.sitio && SITIOS[f.sitio]) || plataformaDesdeUrl(url);
    const estadoTexto = e.estado || f.estado_inicial || 'sin_decidir';
    const estado: EstadoPostulacion = esEstado(estadoTexto) ? estadoTexto : 'sin_decidir';
    const fecha = e.fecha || f.fecha_inicial;
    const postulo =
      esDeAvance(estado) ||
      estado === 'aceptada' ||
      ((estado === 'rechazado' || estado === 'descartado') && !!fecha);
    return {
      aviso: {
        titulo: e.titulo || f.titulo || '',
        empresa: e.empresa || f.empresa || '',
        url,
        plataforma,
        modalidad: modalidadDesdeTexto(f.modalidad),
        ...(f.ubicacion ? { ubicacion: f.ubicacion.slice(0, 200) } : {}),
      },
      estado,
      ...(postulo && fecha && esFecha(fecha) ? { fechaPostulacion: fecha } : {}),
      ...(postulo ? { canal: { tipo: 'portal', valor: NOMBRES[plataforma] } } : {}),
      ...(estado === 'rechazado' || estado === 'descartado'
        ? { motivo: 'Importado del seguimiento anterior' }
        : {}),
      ...(e.nota ? { nota: e.nota } : {}),
    };
  });
}
