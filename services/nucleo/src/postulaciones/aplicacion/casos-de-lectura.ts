import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import { DatoInvalido, NoEncontrada } from '../dominio/errores';
import { esEstado, type EstadoPostulacion } from '../dominio/estado';
import { esUno, PLATAFORMAS, type Plataforma } from '../dominio/objetos-valor/valores';
import type { Contexto } from './base';
import type { FiltrosPostulaciones } from './puertos';
import type { ElementoResumen, VistaDetalle, VistaExportacion, VistaResumen, VistaTablero } from './vistas';

const PRIORIDADES: readonly Prioridad[] = ['alta', 'media', 'baja'];

/** Nada silencioso: un filtro desconocido es VALIDACION, nunca una lista vacía (PLAN §12.1). */
export class ListarPostulaciones {
  constructor(private readonly c: Contexto) {}
  async ejecutar(e: {
    estados?: string[];
    plataformas?: string[];
    prioridades?: string[];
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: VistaResumen[]; total: number; limit: number; offset: number }> {
    const filtros: FiltrosPostulaciones = {};
    if (e.estados?.length) {
      const malo = e.estados.find((x) => !esEstado(x));
      if (malo) throw new DatoInvalido('estado', `Estado desconocido: ${malo}`);
      filtros.estados = e.estados as EstadoPostulacion[];
    }
    if (e.plataformas?.length) {
      const malo = e.plataformas.find((x) => !esUno(PLATAFORMAS, x));
      if (malo) throw new DatoInvalido('plataforma', `Plataforma desconocida: ${malo}`);
      filtros.plataformas = e.plataformas as Plataforma[];
    }
    if (e.prioridades?.length) {
      const malo = e.prioridades.find((x) => !esUno(PRIORIDADES, x));
      if (malo) throw new DatoInvalido('prioridad', `Prioridad desconocida: ${malo}`);
      filtros.prioridades = e.prioridades as Prioridad[];
    }
    if (e.q?.trim()) filtros.q = e.q.trim().slice(0, 200);
    const limit = e.limit ?? 50;
    const offset = e.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      throw new DatoInvalido('limit', 'limit va de 1 a 200');
    if (!Number.isInteger(offset) || offset < 0)
      throw new DatoInvalido('offset', 'offset no puede ser negativo');
    const r = await this.c.consultas.listar(filtros, { limit, offset });
    return { ...r, limit, offset };
  }
}

export class VerTablero {
  constructor(private readonly c: Contexto) {}
  ejecutar(): Promise<VistaTablero> {
    return this.c.consultas.tablero();
  }
}

export class VerPostulacion {
  constructor(private readonly c: Contexto) {}
  async ejecutar(id: string): Promise<VistaDetalle> {
    const d = await this.c.consultas.detalle(id);
    if (!d) throw new NoEncontrada();
    return d;
  }
}

export class ResumenDesde {
  constructor(private readonly c: Contexto) {}
  async ejecutar(desde?: string): Promise<ElementoResumen[]> {
    const fecha = desde ? new Date(desde) : new Date(this.c.reloj.ahora().getTime() - 7 * 86_400_000);
    if (Number.isNaN(fecha.getTime())) throw new DatoInvalido('desde', 'La fecha no es válida');
    return this.c.consultas.resumenDesde(fecha);
  }
}

export class Exportar {
  constructor(private readonly c: Contexto) {}
  ejecutar(): Promise<VistaExportacion> {
    return this.c.consultas.exportar();
  }
}
