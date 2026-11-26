import { AggregateRoot } from '../../compartido/dominio/aggregate-root';
import { esFecha, type Deps, type Fecha, type Reloj } from '../../compartido/dominio/puertos';
import { DatoInvalido } from './errores';
import { esUno, textoObligatorio } from './objetos-valor/valores';

/**
 * Paso pendiente (docs/diseno/pasos.md §4.1): algo que una o más postulaciones te piden hacer
 * (un test, mandar el CV, agendar una llamada). Es texto libre: cada proceso pide cosas distintas.
 * No cambia el estado ni la prioridad de la postulación; avisa aparte (evento `paso.detectado`).
 */
export const ESTADOS_DE_PASO = ['pendiente', 'hecho', 'descartado'] as const;
export type EstadoDePaso = (typeof ESTADOS_DE_PASO)[number];

/** Por dónde llegó el pedido. */
export const FUENTES_DE_PASO = ['correo', 'linkedin', 'portal', 'persona'] as const;
export type FuenteDePaso = (typeof FUENTES_DE_PASO)[number];

/** Quién lo anotó: el lector de correo, la IA de la persona por MCP o la persona. */
export const REGISTRADORES_DE_PASO = ['vigia', 'ia', 'persona'] as const;
export type RegistradorDePaso = (typeof REGISTRADORES_DE_PASO)[number];

/** Quién lo cerró (R16). `sistema` queda para cierres automáticos que no son de un correo. */
export const CERRADORES_DE_PASO = ['persona', 'ia', 'correo', 'sistema'] as const;
export type CerradorDePaso = (typeof CERRADORES_DE_PASO)[number];

export const EVENTOS_DE_PASO = {
  detectado: 'paso.detectado',
  resuelto: 'paso.resuelto',
} as const;

export interface CierreDePaso {
  readonly por: CerradorDePaso;
  readonly en: Date;
  readonly nota?: string;
  /** El correo que lo dio por hecho (R20). */
  readonly referenciaExterna?: string;
}

/** Un correo posterior parece decir que ya se hizo, pero con confianza bajo el umbral (R20). */
export interface SugerenciaDeCierre {
  readonly referenciaExterna?: string;
  readonly confianza: number;
  readonly en: Date;
}

export interface DatosPaso {
  id: string;
  postulacionIds: string[];
  descripcion: string;
  detalle?: string;
  plazo?: Fecha;
  enlace?: string;
  estado: EstadoDePaso;
  fuente: FuenteDePaso;
  registradoPor: RegistradorDePaso;
  contactoRedId?: string;
  referenciaExterna?: string;
  cierre?: CierreDePaso;
  sugerenciaCierre?: SugerenciaDeCierre;
  /** Cuándo te lo pidieron (fecha del correo o del mensaje). */
  pedidoEn: Date;
  creadoEn: Date;
  actualizadoEn: Date;
  version: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CIERRE_AL_CREAR: Record<RegistradorDePaso, CerradorDePaso> = {
  vigia: 'correo',
  ia: 'ia',
  persona: 'persona',
};

const opcional = (campo: string, v: unknown, max: number): string | undefined =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
    ? undefined
    : textoObligatorio(campo, v, max);

function descripcionValida(v: unknown): string {
  const d = textoObligatorio('descripcion', v, 120);
  if (d.length < 3) throw new DatoInvalido('descripcion', 'La descripción del paso es muy corta');
  return d;
}

function plazoValido(v: unknown): Fecha | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || !esFecha(v)) throw new DatoInvalido('plazo', 'El plazo va como AAAA-MM-DD');
  return v;
}

function enlaceValido(v: unknown): string | undefined {
  const e = opcional('enlace', v, 2000);
  if (e === undefined) return undefined;
  try {
    const u = new URL(e);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocolo');
  } catch {
    throw new DatoInvalido('enlace', 'El enlace no es una URL http o https');
  }
  return e;
}

/** R15: al menos una postulación, sin repetir. */
function postulacionesValidas(v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0)
    throw new DatoInvalido('postulacionIds', 'Un paso necesita al menos una postulación');
  const ids = [...new Set(v.map((x) => (typeof x === 'string' ? x.trim() : '')))];
  if (ids.some((x) => !UUID.test(x)))
    throw new DatoInvalido('postulacionIds', 'Hay un id de postulación que no es válido');
  if (ids.length > 20) throw new DatoInvalido('postulacionIds', 'Un paso toca a lo más 20 postulaciones');
  return ids;
}

function nota(v: unknown): string | undefined {
  return opcional('nota', v, 1000);
}

/** Lo que un correo pide, antes de saber a qué postulaciones va (la bandeja lo guarda así, §4.3). */
export interface PropuestaDePaso {
  descripcion: string;
  detalle?: string;
  plazo?: Fecha;
  enlace?: string;
}

export function propuestaDePaso(v: unknown): PropuestaDePaso {
  if (typeof v !== 'object' || v === null) throw new DatoInvalido('paso', 'El paso no es válido');
  const x = v as Record<string, unknown>;
  const detalle = opcional('detalle', x['detalle'], 2000);
  const plazo = plazoValido(x['plazo']);
  const enlace = enlaceValido(x['enlace']);
  return {
    descripcion: descripcionValida(x['descripcion']),
    ...(detalle ? { detalle } : {}),
    ...(plazo ? { plazo } : {}),
    ...(enlace ? { enlace } : {}),
  };
}

export class Paso extends AggregateRoot {
  private esNuevo = false;

  private constructor(private d: DatosPaso) {
    super();
  }

  /** R15 y R16: se crea pendiente o, si ya se hizo, hecho (para que el proceso de la ficha quede completo). */
  static crear(
    p: {
      postulacionIds: unknown;
      descripcion: unknown;
      detalle?: unknown;
      plazo?: unknown;
      enlace?: unknown;
      estado?: unknown;
      fuente: unknown;
      registradoPor: unknown;
      contactoRedId?: unknown;
      referenciaExterna?: unknown;
      pedidoEn?: Date;
      nota?: unknown;
    },
    deps: Deps,
  ): Paso {
    const estado = p.estado ?? 'pendiente';
    if (estado !== 'pendiente' && estado !== 'hecho')
      throw new DatoInvalido('estado', 'Un paso nuevo queda pendiente o hecho');
    if (!esUno(FUENTES_DE_PASO, p.fuente)) throw new DatoInvalido('fuente', 'Fuente del paso desconocida');
    if (!esUno(REGISTRADORES_DE_PASO, p.registradoPor))
      throw new DatoInvalido('registradoPor', 'Quién registró el paso es desconocido');
    const contactoRedId = opcional('contactoRedId', p.contactoRedId, 36);
    if (contactoRedId && !UUID.test(contactoRedId))
      throw new DatoInvalido('contactoRedId', 'El id del contacto no es válido');
    const ahora = deps.reloj.ahora();
    const referenciaExterna = opcional('referenciaExterna', p.referenciaExterna, 500);
    const detalle = opcional('detalle', p.detalle, 2000);
    const plazo = plazoValido(p.plazo);
    const enlace = enlaceValido(p.enlace);
    const notaCierre = nota(p.nota);
    const paso = new Paso({
      id: deps.ids.nuevo(),
      postulacionIds: postulacionesValidas(p.postulacionIds),
      descripcion: descripcionValida(p.descripcion),
      ...(detalle ? { detalle } : {}),
      ...(plazo ? { plazo } : {}),
      ...(enlace ? { enlace } : {}),
      estado,
      fuente: p.fuente,
      registradoPor: p.registradoPor,
      ...(contactoRedId ? { contactoRedId } : {}),
      ...(referenciaExterna ? { referenciaExterna } : {}),
      ...(estado === 'hecho'
        ? {
            cierre: {
              por: CIERRE_AL_CREAR[p.registradoPor],
              en: ahora,
              ...(notaCierre ? { nota: notaCierre } : {}),
            },
          }
        : {}),
      pedidoEn: p.pedidoEn ?? ahora,
      creadoEn: ahora,
      actualizadoEn: ahora,
      version: 0,
    });
    paso.esNuevo = true;
    // R18: también para una postulación cerrada; un pedido siempre avisa con prioridad alta.
    if (estado === 'pendiente') paso.emitir(EVENTOS_DE_PASO.detectado, 'alta', ahora);
    return paso;
  }

  static reconstituir(d: DatosPaso): Paso {
    return new Paso(structuredClone(d));
  }

  get id(): string {
    return this.d.id;
  }
  get estado(): EstadoDePaso {
    return this.d.estado;
  }
  get version(): number {
    return this.d.version;
  }
  get postulacionIds(): readonly string[] {
    return this.d.postulacionIds;
  }
  get creado(): boolean {
    return this.esNuevo;
  }
  datos(): Readonly<DatosPaso> {
    return structuredClone(this.d);
  }
  marcarGuardado(version: number): void {
    this.d.version = version;
    this.esNuevo = false;
  }

  /** ¿Toca alguna de estas postulaciones? */
  toca(ids: readonly string[]): boolean {
    return this.d.postulacionIds.some((x) => ids.includes(x));
  }

  /** R16: hecho, descartado o reabrir (pendiente). Nunca se borra. */
  resolver(
    estado: unknown,
    p: { por: CerradorDePaso; nota?: unknown; referenciaExterna?: string },
    reloj: Reloj,
  ): void {
    if (!esUno(ESTADOS_DE_PASO, estado)) throw new DatoInvalido('estado', 'Estado del paso desconocido');
    if (estado === this.d.estado) throw new DatoInvalido('estado', `El paso ya está ${estado}`);
    const ahora = reloj.ahora();
    const n = nota(p.nota);
    const { cierre: _cierre, sugerenciaCierre: _sugerencia, ...resto } = this.d;
    this.d =
      estado === 'pendiente'
        ? { ...resto, estado, actualizadoEn: ahora }
        : {
            ...resto,
            estado,
            cierre: {
              por: p.por,
              en: ahora,
              ...(n ? { nota: n } : {}),
              ...(p.referenciaExterna ? { referenciaExterna: p.referenciaExterna } : {}),
            },
            actualizadoEn: ahora,
          };
    this.emitir(EVENTOS_DE_PASO.resuelto, 'baja', ahora, { por: p.por });
  }

  /** R20: un correo posterior lo da por hecho. Con confianza alta lo cierra; si no, deja la sugerencia. */
  cumplidoPorCorreo(confianza: number, umbral: number, referenciaExterna: string | undefined, reloj: Reloj) {
    if (this.d.estado !== 'pendiente') return 'ignorado' as const;
    if (confianza >= umbral) {
      this.resolver('hecho', { por: 'correo', ...(referenciaExterna ? { referenciaExterna } : {}) }, reloj);
      return 'cerrado' as const;
    }
    this.d = {
      ...this.d,
      sugerenciaCierre: {
        ...(referenciaExterna ? { referenciaExterna } : {}),
        confianza,
        en: reloj.ahora(),
      },
      actualizadoEn: reloj.ahora(),
    };
    return 'sugerido' as const;
  }

  /** R19: un recordatorio del mismo paso actualiza el plazo y el detalle en vez de crear otro. */
  recordar(p: { plazo?: unknown; detalle?: unknown }, reloj: Reloj): void {
    const plazo = plazoValido(p.plazo);
    const detalle = opcional('detalle', p.detalle, 2000);
    this.d = {
      ...this.d,
      ...(plazo ? { plazo } : {}),
      ...(detalle ? { detalle } : {}),
      actualizadoEn: reloj.ahora(),
    };
  }

  /** Editar a mano o por MCP. `null` borra el detalle, el plazo o el enlace. */
  editar(
    p: {
      descripcion?: unknown;
      detalle?: unknown;
      plazo?: unknown;
      enlace?: unknown;
      postulacionIds?: unknown;
    },
    reloj: Reloj,
  ): void {
    const d = { ...this.d };
    if (p.descripcion !== undefined) d.descripcion = descripcionValida(p.descripcion);
    if (p.postulacionIds !== undefined) d.postulacionIds = postulacionesValidas(p.postulacionIds);
    const opcionales: [
      keyof DatosPaso & ('detalle' | 'plazo' | 'enlace'),
      unknown,
      (v: unknown) => unknown,
    ][] = [
      ['detalle', p.detalle, (v) => opcional('detalle', v, 2000)],
      ['plazo', p.plazo, plazoValido],
      ['enlace', p.enlace, enlaceValido],
    ];
    for (const [campo, valor, validar] of opcionales) {
      if (valor === undefined) continue;
      const v = validar(valor);
      if (v === undefined) delete d[campo];
      else (d as Record<string, unknown>)[campo] = v;
    }
    d.actualizadoEn = reloj.ahora();
    this.d = d;
  }

  private emitir(tipo: string, prioridad: 'alta' | 'baja', ocurridoEn: Date, extra: object = {}): void {
    this.registrar({
      tipo,
      version: 1,
      ocurridoEn,
      prioridad,
      datos: {
        pasoId: this.d.id,
        postulacionIds: this.d.postulacionIds,
        descripcion: this.d.descripcion,
        estado: this.d.estado,
        fuente: this.d.fuente,
        ...extra,
      },
    });
  }
}

/** Puerto de salida de los pasos. */
export interface PasoRepositorio {
  porId(id: string): Promise<Paso | null>;
  porReferencia(referenciaExterna: string): Promise<Paso | null>;
  /** Pasos (cualquier estado) que tocan alguna de estas postulaciones, del más antiguo al más nuevo. */
  deLasPostulaciones(ids: readonly string[]): Promise<Paso[]>;
  /** Estado de cada postulación que existe (las que faltan no vienen). */
  estadosDePostulaciones(ids: readonly string[]): Promise<Map<string, string>>;
  /** Guarda con bloqueo optimista (`CONFLICTO`) y sus eventos en el outbox, en una transacción. */
  guardar(paso: Paso): Promise<void>;
}
