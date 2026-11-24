import { describirRegla, etiquetasEnUso } from '../../compartido/dominio/perfil';
import type { GeneradorId, Reloj } from '../../compartido/dominio/puertos';
import {
  CRITERIOS_EMPLEO,
  type CriterioEmpleo,
  type DatosDeLaPersona,
  type EntradaPerfilEmpleo,
  type PerfilEmpleoRepositorio,
  type ReglaEmpleo,
} from '../dominio/perfil-empleo';

export interface ContextoDePerfil {
  perfil: PerfilEmpleoRepositorio;
  reloj: Reloj;
  ids: GeneradorId;
}

export type VistaReglaDePerfil = ReglaEmpleo & {
  /** «Dura · Santiago solo híbrido o remoto #ubicacion». */
  descripcion: string;
  /** El código la revisa en cada postulación; si no, la aplica tu IA leyéndola. */
  porCodigo: boolean;
};

export interface VistaPerfilEmpleo {
  reglas: VistaReglaDePerfil[];
  datos: DatosDeLaPersona;
  /** Del más nuevo al más antiguo (30). */
  historial: { ocurridoEn: string; origen: string; motivo: string; resumen: string[] }[];
  criterios: readonly CriterioEmpleo[];
  etiquetas: { etiqueta: string; total: number }[];
  actualizadaEn: string | null;
}

/** Ver y cambiar el perfil de búsqueda de Empleo (perfil.md §3.3). REST y MCP lo usan igual. */
export class CasosDePerfil {
  constructor(private readonly c: ContextoDePerfil) {}

  async ver(): Promise<VistaPerfilEmpleo> {
    const d = (await this.c.perfil.leer()).datos();
    return {
      reglas: d.reglas.map((r) => ({ ...r, descripcion: describirRegla(r), porCodigo: Boolean(r.criterio) })),
      datos: d.datos,
      historial: d.historial
        .map((h) => ({ ...h, ocurridoEn: h.ocurridoEn.toISOString() }))
        .reverse()
        .slice(0, 30),
      criterios: CRITERIOS_EMPLEO,
      etiquetas: etiquetasEnUso(d.reglas),
      actualizadaEn: d.actualizadaEn?.toISOString() ?? null,
    };
  }

  async cambiar(e: EntradaPerfilEmpleo, origen: string): Promise<VistaPerfilEmpleo> {
    const p = await this.c.perfil.leer();
    p.cambiar(e, origen, { reloj: this.c.reloj, ids: this.c.ids });
    await this.c.perfil.guardar(p);
    return this.ver();
  }
}
