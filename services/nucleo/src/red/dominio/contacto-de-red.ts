import type { Deps, Fecha, Reloj } from '../../compartido/dominio/puertos';
import { DatoInvalido } from '../../postulaciones/dominio/errores';
import { esUno, fechaValida, textoObligatorio } from '../../postulaciones/dominio/objetos-valor/valores';

/**
 * Tu red de LinkedIn: personas, solicitudes de conexión y conversaciones. LinkedIn no tiene API para esto,
 * así que la actualiza tu IA por MCP cuando se lo pides (desde tu navegador) o tú desde la consola.
 */
export const ESTADOS_DE_CONEXION = [
  'ninguna',
  'solicitud_enviada',
  'solicitud_recibida',
  'conectados',
  'rechazada',
  'retirada',
] as const;
export type EstadoDeConexion = (typeof ESTADOS_DE_CONEXION)[number];

export const TIPOS_DE_INTERACCION = [
  'solicitud_enviada',
  'solicitud_recibida',
  'solicitud_aceptada',
  'solicitud_rechazada',
  'solicitud_retirada',
  'mensaje_enviado',
  'mensaje_recibido',
  'nota',
] as const;
export type TipoDeInteraccion = (typeof TIPOS_DE_INTERACCION)[number];

export const ORIGENES_DE_RED = ['consola', 'ia', 'correo'] as const;
export type OrigenDeRed = (typeof ORIGENES_DE_RED)[number];

/** Qué falta en la conversación: te toca a ti, esperas a la otra persona o nada. */
export type Pendiente = 'responder' | 'esperando' | null;

export interface Interaccion {
  readonly id: string;
  readonly tipo: TipoDeInteraccion;
  readonly resumen: string;
  readonly ocurridaEn: Date;
  readonly origen: OrigenDeRed;
  readonly referenciaExterna?: string;
}

export interface DatosContactoRed {
  id: string;
  nombre: string;
  perfilUrl: string;
  titular?: string;
  empresa?: string;
  conexion: EstadoDeConexion;
  interacciones: Interaccion[];
  postulacionIds: string[];
  seguimiento?: Fecha;
  notas?: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

const CONEXION_POR_TIPO: Partial<Record<TipoDeInteraccion, EstadoDeConexion>> = {
  solicitud_enviada: 'solicitud_enviada',
  solicitud_recibida: 'solicitud_recibida',
  solicitud_aceptada: 'conectados',
  solicitud_rechazada: 'rechazada',
  solicitud_retirada: 'retirada',
};

/** `linkedin.com/in/<id>` en cualquier forma → `https://www.linkedin.com/in/<id>`. */
export function perfilNormalizado(url: unknown): string {
  const t = textoObligatorio('perfilUrl', url, 500).trim();
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^/?#\s]+)/i.exec(t);
  if (!m?.[1]) throw new DatoInvalido('perfilUrl', 'Tiene que ser un perfil de LinkedIn (linkedin.com/in/…)');
  const id = decodeURIComponent(m[1]);
  // El id interno (ACoAA…) distingue mayúsculas; el nombre de perfil elegido por la persona, no.
  return `https://www.linkedin.com/in/${/^AC[a-zA-Z]AA/.test(id) ? id : id.toLowerCase()}`;
}

const VENTANA_AVISO_MS = 12 * 3_600_000;

const opcional = (campo: string, v: unknown, max: number) =>
  v === undefined || v === null || v === '' ? undefined : textoObligatorio(campo, v, max);

export class ContactoDeRed {
  private constructor(private d: DatosContactoRed) {}

  static crear(
    p: { nombre: unknown; perfilUrl: unknown; titular?: unknown; empresa?: unknown },
    deps: Deps,
  ): ContactoDeRed {
    const ahora = deps.reloj.ahora();
    const titular = opcional('titular', p.titular, 300);
    const empresa = opcional('empresa', p.empresa, 200);
    return new ContactoDeRed({
      id: deps.ids.nuevo(),
      nombre: textoObligatorio('nombre', p.nombre, 200),
      perfilUrl: perfilNormalizado(p.perfilUrl),
      ...(titular ? { titular } : {}),
      ...(empresa ? { empresa } : {}),
      conexion: 'ninguna',
      interacciones: [],
      postulacionIds: [],
      creadoEn: ahora,
      actualizadoEn: ahora,
    });
  }

  static reconstituir(d: DatosContactoRed): ContactoDeRed {
    return new ContactoDeRed({
      ...d,
      interacciones: [...d.interacciones],
      postulacionIds: [...d.postulacionIds],
    });
  }

  get id(): string {
    return this.d.id;
  }

  datos(): DatosContactoRed {
    return {
      ...this.d,
      interacciones: [...this.d.interacciones],
      postulacionIds: [...this.d.postulacionIds],
    };
  }

  actualizar(
    p: { nombre?: unknown; titular?: unknown; empresa?: unknown; notas?: unknown; seguimiento?: unknown },
    reloj: Reloj,
  ): void {
    if (p.nombre !== undefined) this.d.nombre = textoObligatorio('nombre', p.nombre, 200);
    for (const [campo, max] of [
      ['titular', 300],
      ['empresa', 200],
      ['notas', 5000],
    ] as const) {
      const v = p[campo];
      if (v === undefined) continue;
      const t = opcional(campo, v, max);
      if (t) this.d[campo] = t;
      else delete this.d[campo];
    }
    if (p.seguimiento !== undefined) {
      if (p.seguimiento === null || p.seguimiento === '') delete this.d.seguimiento;
      else this.d.seguimiento = fechaValida('seguimiento', p.seguimiento);
    }
    this.d.actualizadoEn = reloj.ahora();
  }

  /**
   * Registra lo que pasó (idempotente: la misma referencia, o el mismo tipo y resumen el mismo día, no se repite).
   * Las solicitudes mueven el estado de la conexión. Devuelve si la agregó.
   */
  registrarInteraccion(
    p: {
      tipo: unknown;
      resumen: unknown;
      ocurridaEn?: Date;
      referenciaExterna?: unknown;
      origen: OrigenDeRed;
    },
    deps: Deps,
  ): boolean {
    if (!esUno(TIPOS_DE_INTERACCION, p.tipo))
      throw new DatoInvalido('tipo', 'Tipo de interacción desconocido');
    const resumen = textoObligatorio('resumen', p.resumen, 1000);
    const ocurridaEn = p.ocurridaEn ?? deps.reloj.ahora();
    if (ocurridaEn.getTime() > deps.reloj.ahora().getTime() + 60_000) {
      throw new DatoInvalido('ocurridaEn', 'La interacción no puede ser futura');
    }
    const referencia = opcional('referenciaExterna', p.referenciaExterna, 500);
    const dia = deps.reloj.fechaDe(ocurridaEn);
    if (p.tipo === 'mensaje_recibido' && this.avisoDeCorreoSobra(p.origen, ocurridaEn, deps)) return false;
    const repetida = this.d.interacciones.some(
      (i) =>
        (referencia && i.referenciaExterna === referencia) ||
        (i.tipo === p.tipo && i.resumen === resumen && deps.reloj.fechaDe(i.ocurridaEn) === dia),
    );
    if (repetida) return false;
    this.d.interacciones.push({
      id: deps.ids.nuevo(),
      tipo: p.tipo,
      resumen,
      ocurridaEn,
      origen: p.origen,
      ...(referencia ? { referenciaExterna: referencia } : {}),
    });
    this.d.interacciones.sort((a, b) => a.ocurridaEn.getTime() - b.ocurridaEn.getTime());
    // La conexión la decide la solicitud más reciente, aunque los datos lleguen desordenados.
    const ultimaSolicitud = this.d.interacciones.filter((i) => CONEXION_POR_TIPO[i.tipo]).at(-1);
    if (ultimaSolicitud) this.d.conexion = CONEXION_POR_TIPO[ultimaSolicitud.tipo]!;
    this.d.actualizadoEn = deps.reloj.ahora();
    return true;
  }

  /**
   * D40: el aviso por correo de un mensaje nuevo no trae el texto y llega después del mensaje.
   * Si el mensaje ya se leyó desde LinkedIn (hasta 12 h antes del aviso), el aviso sobra; si el aviso
   * llegó primero, el mensaje leído lo reemplaza. Así el mismo mensaje no se cuenta dos veces.
   */
  private avisoDeCorreoSobra(origen: OrigenDeRed, ocurridaEn: Date, deps: Deps): boolean {
    const t = ocurridaEn.getTime();
    const recibido = (i: Interaccion) => i.tipo === 'mensaje_recibido';
    if (origen === 'correo') {
      return this.d.interacciones.some(
        (i) =>
          recibido(i) &&
          i.origen !== 'correo' &&
          t - i.ocurridaEn.getTime() >= 0 &&
          t - i.ocurridaEn.getTime() <= VENTANA_AVISO_MS,
      );
    }
    const antes = this.d.interacciones.length;
    this.d.interacciones = this.d.interacciones.filter(
      (i) =>
        !(
          recibido(i) &&
          i.origen === 'correo' &&
          i.ocurridaEn.getTime() - t >= 0 &&
          i.ocurridaEn.getTime() - t <= VENTANA_AVISO_MS
        ),
    );
    if (this.d.interacciones.length !== antes) this.d.actualizadoEn = deps.reloj.ahora();
    return false;
  }

  vincularPostulacion(postulacionId: string, reloj: Reloj): void {
    const id = textoObligatorio('postulacionId', postulacionId, 100);
    if (!this.d.postulacionIds.includes(id)) this.d.postulacionIds.push(id);
    this.d.actualizadoEn = reloj.ahora();
  }

  desvincularPostulacion(postulacionId: string, reloj: Reloj): void {
    this.d.postulacionIds = this.d.postulacionIds.filter((x) => x !== postulacionId);
    this.d.actualizadoEn = reloj.ahora();
  }

  /** Te toca responder si lo último fue suyo (un mensaje o una solicitud que te mandó); esperas si fue tuyo. */
  pendiente(): Pendiente {
    if (this.d.conexion === 'solicitud_recibida') return 'responder';
    const ultimo = [...this.d.interacciones]
      .reverse()
      .find((i) => i.tipo === 'mensaje_enviado' || i.tipo === 'mensaje_recibido');
    if (ultimo?.tipo === 'mensaje_recibido') return 'responder';
    if (ultimo?.tipo === 'mensaje_enviado') return 'esperando';
    return this.d.conexion === 'solicitud_enviada' ? 'esperando' : null;
  }

  ultimaInteraccion(): Interaccion | undefined {
    return this.d.interacciones.filter((i) => i.tipo !== 'nota').at(-1);
  }

  seguimientoVencido(reloj: Reloj): boolean {
    return this.d.seguimiento !== undefined && this.d.seguimiento <= reloj.hoy();
  }
}

export interface RedRepositorio {
  porId(id: string): Promise<ContactoDeRed | null>;
  porPerfil(perfilUrl: string): Promise<ContactoDeRed | null>;
  todos(): Promise<ContactoDeRed[]>;
  guardar(c: ContactoDeRed): Promise<void>;
}
