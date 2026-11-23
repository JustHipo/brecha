import type { Deps } from '../../compartido/dominio/puertos';
import { DatoInvalido } from './errores';
import { esEstado, type EstadoPostulacion } from './estado';
import { esUno, PLATAFORMAS, textoObligatorio, type Plataforma } from './objetos-valor/valores';
import { FUENTES_DE_SENAL, type FuenteDeSenal } from './partes';

export type EstadoDePendiente = 'pendiente' | 'asociada' | 'descartada';

export interface DatosPendiente {
  id: string;
  fuente: FuenteDeSenal;
  plataforma: Plataforma;
  resumen: string;
  estadoSugerido?: EstadoPostulacion;
  confianza: number;
  recibidaEn: Date;
  referenciaExterna?: string;
  remitente?: string;
  asunto?: string;
  empresaDetectada?: string;
  cargoDetectado?: string;
  estado: EstadoDePendiente;
  postulacionId?: string;
  resueltaEn?: Date;
  creadaEn: Date;
}

const opcional = (campo: string, v: unknown, max: number) =>
  v === undefined || v === null || v === '' ? undefined : textoObligatorio(campo, v, max);

/**
 * Señal que llegó sin postulación (la Bandeja, docs/diseno/f2.md §5). Todavía no es de ninguna:
 * al asociarla se registra como señal de esa postulación con la misma referencia externa.
 */
export class SenalPendiente {
  private constructor(private d: DatosPendiente) {}

  static crear(
    p: {
      fuente: unknown;
      plataforma?: unknown;
      resumen: unknown;
      estadoSugerido?: unknown;
      confianza: unknown;
      recibidaEn?: Date;
      referenciaExterna?: unknown;
      remitente?: unknown;
      asunto?: unknown;
      empresaDetectada?: unknown;
      cargoDetectado?: unknown;
    },
    deps: Deps,
  ): SenalPendiente {
    if (!esUno(FUENTES_DE_SENAL, p.fuente)) throw new DatoInvalido('fuente', 'Fuente desconocida');
    const plataforma = p.plataforma ?? 'otra';
    if (!esUno(PLATAFORMAS, plataforma)) throw new DatoInvalido('plataforma', 'Plataforma desconocida');
    if (typeof p.confianza !== 'number' || !(p.confianza >= 0 && p.confianza <= 1)) {
      throw new DatoInvalido('confianza', 'La confianza va de 0 a 1');
    }
    if (p.estadoSugerido !== undefined && !esEstado(p.estadoSugerido)) {
      throw new DatoInvalido('estadoSugerido', 'Estado desconocido');
    }
    const ahora = deps.reloj.ahora();
    const extra = {
      referenciaExterna: opcional('referenciaExterna', p.referenciaExterna, 500),
      remitente: opcional('remitente', p.remitente, 320),
      asunto: opcional('asunto', p.asunto, 500),
      empresaDetectada: opcional('empresaDetectada', p.empresaDetectada, 200),
      cargoDetectado: opcional('cargoDetectado', p.cargoDetectado, 300),
    };
    return new SenalPendiente({
      id: deps.ids.nuevo(),
      fuente: p.fuente,
      plataforma,
      resumen: textoObligatorio('resumen', p.resumen, 1000),
      ...(p.estadoSugerido ? { estadoSugerido: p.estadoSugerido as EstadoPostulacion } : {}),
      confianza: p.confianza,
      recibidaEn: p.recibidaEn ?? ahora,
      ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)),
      estado: 'pendiente',
      creadaEn: ahora,
    });
  }

  static reconstituir(d: DatosPendiente): SenalPendiente {
    return new SenalPendiente({ ...d });
  }

  get id(): string {
    return this.d.id;
  }
  get estado(): EstadoDePendiente {
    return this.d.estado;
  }
  datos(): Readonly<DatosPendiente> {
    return structuredClone(this.d);
  }

  /** Lo que se registra en la postulación al asociar (misma referencia: no se duplica). */
  comoSenal() {
    const d = this.d;
    return {
      fuente: d.fuente,
      plataforma: d.plataforma,
      resumen: d.resumen,
      confianza: d.confianza,
      recibidaEn: d.recibidaEn,
      ...(d.estadoSugerido ? { estadoSugerido: d.estadoSugerido } : {}),
      ...(d.referenciaExterna ? { referenciaExterna: d.referenciaExterna } : {}),
    };
  }

  asociar(postulacionId: string, ahora: Date): void {
    this.exigirPendiente();
    this.d = { ...this.d, estado: 'asociada', postulacionId, resueltaEn: ahora };
  }

  descartar(ahora: Date): void {
    this.exigirPendiente();
    this.d = { ...this.d, estado: 'descartada', resueltaEn: ahora };
  }

  exigirPendiente(): void {
    if (this.d.estado !== 'pendiente') throw new DatoInvalido('senalId', 'Esta señal ya salió de la bandeja');
  }
}

/** Puerto de salida de la Bandeja. */
export interface BandejaRepositorio {
  porId(id: string): Promise<SenalPendiente | null>;
  guardar(s: SenalPendiente, evento?: { tipo: string; prioridad: 'alta' | 'media' | 'baja' }): Promise<void>;
  /** ¿Ya se usó esta referencia externa, en una postulación o en la bandeja? (ADR 0015) */
  referenciaUsada(referencia: string): Promise<boolean>;
  /** Las que siguen en la bandeja, de la más nueva a la más antigua. */
  pendientes(): Promise<DatosPendiente[]>;
}
