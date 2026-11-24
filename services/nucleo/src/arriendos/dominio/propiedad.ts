import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import type { Deps, Fecha, Reloj } from '../../compartido/dominio/puertos';
import {
  destinosDe,
  esEstado,
  esTerminal,
  estaCerrada,
  ordenDe,
  PIDEN_MOTIVO,
  puedeIrA,
  type EstadoPropiedad,
} from './estado';
import {
  correoOpcional,
  DatoInvalido,
  enteroOpcional,
  EstadoTerminal,
  FUENTES_AUTOMATICAS,
  FUENTES_DE_SENAL,
  fechaOpcional,
  MONEDAS,
  numero,
  numeroOpcional,
  ROLES_DE_CONTACTO,
  siNoOpcional,
  telefonoOpcional,
  texto,
  textoLargo,
  textoOpcional,
  TIPOS_DE_INTERACCION,
  TIPOS_DE_PROPIEDAD,
  TransicionInvalida,
  uno,
  urlNormalizada,
  urlOpcional,
  vacio,
  type FuenteDeSenal,
  type Moneda,
  type Origen,
  type RolDeContacto,
  type TipoDeInteraccion,
  type TipoDePropiedad,
} from './valores';

/**
 * Una propiedad que sigues para arrendar (docs/diseno/arriendos.md §5). Lo que se lee junto (publicaciones,
 * contactos y sus conversaciones, visitas, señales) vive dentro del agregado: son pocos por propiedad.
 */

export interface Precio {
  readonly monto: number;
  readonly moneda: Moneda;
}

export interface Ubicacion {
  readonly lat: number;
  readonly lon: number;
  /** `geocodificada` por la dirección, `manual` si moviste el pin, `comuna` si es el centro de la comuna. */
  readonly origen: 'geocodificada' | 'manual' | 'comuna';
}

export interface Requisitos {
  /** Renta líquida mínima, en veces el arriendo (3 = «renta 3 veces»). */
  readonly rentaVeces?: number;
  readonly aval?: boolean;
  readonly mesesGarantia?: number;
  /** Comisión de corretaje, en meses de arriendo (0,5 = medio mes). */
  readonly comisionMeses?: number;
  readonly documentos?: readonly string[];
}

export interface Publicacion {
  readonly id: string;
  readonly canalId: string;
  readonly url?: string;
  /** La URL normalizada: la llave de los duplicados seguros. */
  readonly urlClave?: string;
  readonly precio?: Precio;
  readonly vistaEn: Date;
}

export interface Interaccion {
  readonly id: string;
  readonly tipo: TipoDeInteraccion;
  readonly resumen: string;
  readonly ocurridaEn: Date;
  readonly canalId?: string;
  readonly origen: Origen;
  readonly referenciaExterna?: string;
}

export interface ContactoPropiedad {
  readonly id: string;
  readonly nombre: string;
  readonly rol: RolDeContacto;
  readonly telefono?: string;
  readonly correo?: string;
  readonly whatsapp?: string;
  /** Formulario o link donde postulaste. */
  readonly enlace?: string;
  readonly linkedin?: string;
  /** Por dónde hablan (un canal del catálogo). */
  readonly canalId?: string;
  readonly interacciones: readonly Interaccion[];
}

export interface Visita {
  readonly id: string;
  readonly fecha: Date;
  readonly estado: 'agendada' | 'hecha' | 'cancelada';
  readonly notas?: string;
}

export interface Nota {
  readonly id: string;
  readonly texto: string;
  readonly creadaEn: Date;
}

export interface CambioDeEstado {
  readonly de: EstadoPropiedad | null;
  readonly a: EstadoPropiedad;
  readonly motivo?: string;
  readonly origen: Origen;
  readonly ocurridoEn: Date;
}

export interface SenalDePropiedad {
  readonly id: string;
  readonly fuente: FuenteDeSenal;
  readonly canalId?: string;
  readonly resumen: string;
  readonly estadoSugerido?: EstadoPropiedad;
  readonly confianza: number;
  readonly referenciaExterna?: string;
  readonly remitente?: string;
  readonly asunto?: string;
  readonly recibidaEn: Date;
  readonly aplicada: boolean;
}

export interface Discrepancia {
  readonly id: string;
  readonly regla: 'contra_senal' | 'visita_sin_registro';
  readonly detalle: string;
  readonly estado: 'abierta' | 'resuelta';
  readonly detectadaEn: Date;
}

export interface DatosDeLaPropiedad {
  tipo: TipoDePropiedad;
  titulo: string;
  direccion?: string;
  comuna?: string;
  ubicacion?: Ubicacion;
  precio?: Precio;
  gastosComunes?: number;
  m2Utiles?: number;
  m2Totales?: number;
  dormitorios?: number;
  banos?: number;
  estacionamientos?: number;
  bodega?: boolean;
  amoblado?: boolean;
  mascotas?: boolean;
  disponibleDesde?: Fecha;
  descripcion?: string;
  requisitos: Requisitos;
}

export interface DatosPropiedad extends DatosDeLaPropiedad {
  id: string;
  estado: EstadoPropiedad;
  motivoCierre?: string;
  publicaciones: Publicacion[];
  contactos: ContactoPropiedad[];
  visitas: Visita[];
  documentosEnviados: string[];
  notas: Nota[];
  cambios: CambioDeEstado[];
  senales: SenalDePropiedad[];
  discrepancias: Discrepancia[];
  version: number;
  creadaEn: Date;
  actualizadaEn: Date;
}

export interface EventoDePropiedad {
  tipo:
    | 'propiedad.creada'
    | 'propiedad.estado_cambiado'
    | 'propiedad.senal_registrada'
    | 'propiedad.discrepancia';
  prioridad: Prioridad;
  ocurridoEn: Date;
  datos: Record<string, unknown>;
}

/** Lo que llega para crear o editar los datos (cualquier campo puede faltar al editar). */
export type EntradaDatos = Partial<Record<keyof DatosDeLaPropiedad, unknown>> & {
  precio?: { monto?: unknown; moneda?: unknown } | null;
  requisitos?: Partial<Record<keyof Requisitos, unknown>> | null;
};

const VENTANA_SENAL_MS = 14 * 86_400_000;

function precioDe(campo: string, v: EntradaDatos['precio']): Precio | undefined {
  if (v === undefined || v === null) return undefined;
  if (vacio(v.monto)) return undefined;
  const moneda = uno(`${campo}.moneda`, MONEDAS, v.moneda ?? 'CLP');
  return { monto: numero(`${campo}.monto`, v.monto, 0.01, moneda === 'UF' ? 10_000 : 1e10), moneda };
}

function requisitosDe(v: EntradaDatos['requisitos']): Requisitos {
  if (!v) return {};
  const documentos = v.documentos;
  if (documentos !== undefined && documentos !== null && !Array.isArray(documentos))
    throw new DatoInvalido('requisitos.documentos', 'Los documentos van en una lista');
  const docs = (documentos ?? []).map((d) => texto('requisitos.documentos', d, 200));
  const r: Requisitos = {
    ...opcional('rentaVeces', numeroOpcional('requisitos.rentaVeces', v.rentaVeces, 0, 10)),
    ...opcional('aval', siNoOpcional('requisitos.aval', v.aval)),
    ...opcional('mesesGarantia', numeroOpcional('requisitos.mesesGarantia', v.mesesGarantia, 0, 24)),
    ...opcional('comisionMeses', numeroOpcional('requisitos.comisionMeses', v.comisionMeses, 0, 12)),
    ...(docs.length ? { documentos: docs } : {}),
  };
  return r;
}

function opcional<K extends string, V>(k: K, v: V | undefined): { [P in K]?: V } {
  return (v === undefined ? {} : { [k]: v }) as { [P in K]?: V };
}

/** Valida y arma los datos. Con `base`, solo cambia lo que viene (null borra un campo opcional). */
export function datosValidos(e: EntradaDatos, base?: DatosDeLaPropiedad): DatosDeLaPropiedad {
  const d: Partial<DatosDeLaPropiedad> = base ? { ...base, requisitos: { ...base.requisitos } } : {};
  const toca = (k: keyof EntradaDatos) => Object.prototype.hasOwnProperty.call(e, k) && e[k] !== undefined;
  const fijar = <K extends keyof DatosDeLaPropiedad>(k: K, v: DatosDeLaPropiedad[K] | undefined) => {
    if (v === undefined) delete d[k];
    else d[k] = v;
  };
  if (toca('tipo') || !base) fijar('tipo', uno('tipo', TIPOS_DE_PROPIEDAD, e.tipo ?? 'departamento'));
  if (toca('direccion')) fijar('direccion', textoOpcional('direccion', e.direccion, 300));
  if (toca('comuna')) fijar('comuna', textoOpcional('comuna', e.comuna, 100));
  if (toca('precio')) fijar('precio', precioDe('precio', e.precio));
  if (toca('gastosComunes')) fijar('gastosComunes', numeroOpcional('gastosComunes', e.gastosComunes, 0, 1e8));
  if (toca('m2Utiles')) fijar('m2Utiles', numeroOpcional('m2Utiles', e.m2Utiles, 1, 100_000));
  if (toca('m2Totales')) fijar('m2Totales', numeroOpcional('m2Totales', e.m2Totales, 1, 100_000));
  if (toca('dormitorios')) fijar('dormitorios', enteroOpcional('dormitorios', e.dormitorios, 0, 50));
  if (toca('banos')) fijar('banos', enteroOpcional('banos', e.banos, 0, 50));
  if (toca('estacionamientos'))
    fijar('estacionamientos', enteroOpcional('estacionamientos', e.estacionamientos, 0, 20));
  if (toca('bodega')) fijar('bodega', siNoOpcional('bodega', e.bodega));
  if (toca('amoblado')) fijar('amoblado', siNoOpcional('amoblado', e.amoblado));
  if (toca('mascotas')) fijar('mascotas', siNoOpcional('mascotas', e.mascotas));
  if (toca('disponibleDesde')) fijar('disponibleDesde', fechaOpcional('disponibleDesde', e.disponibleDesde));
  if (toca('descripcion')) {
    const t = vacio(e.descripcion) ? undefined : textoLargo('descripcion', e.descripcion, 10_000);
    fijar('descripcion', t);
  }
  if (toca('requisitos')) d.requisitos = requisitosDe(e.requisitos);
  d.requisitos ??= {};
  if (toca('titulo')) fijar('titulo', textoOpcional('titulo', e.titulo, 200));
  if (!d.titulo) d.titulo = tituloSugerido(d as DatosDeLaPropiedad);
  return d as DatosDeLaPropiedad;
}

const NOMBRE_TIPO: Record<TipoDePropiedad, string> = {
  departamento: 'Departamento',
  casa: 'Casa',
  pieza: 'Pieza',
  otro: 'Propiedad',
};

/** «Departamento 2D en Ñuñoa» si no le pusiste nombre. */
export function tituloSugerido(d: Pick<DatosDeLaPropiedad, 'tipo' | 'dormitorios' | 'comuna' | 'direccion'>) {
  const dorm = d.dormitorios !== undefined ? ` ${d.dormitorios}D` : '';
  const donde = d.comuna ? ` en ${d.comuna}` : d.direccion ? ` en ${d.direccion}` : '';
  return `${NOMBRE_TIPO[d.tipo]}${dorm}${donde}`.slice(0, 200);
}

export class Propiedad {
  private eventos: EventoDePropiedad[] = [];

  private constructor(private d: DatosPropiedad) {}

  static crear(
    e: EntradaDatos & {
      publicacion?: { canalId: string; url?: unknown };
      estado?: unknown;
    },
    origen: Origen,
    deps: Deps,
  ): Propiedad {
    const ahora = deps.reloj.ahora();
    const estado = e.estado === undefined ? 'vista' : e.estado;
    if (!esEstado(estado)) throw new DatoInvalido('estado', 'Estado desconocido');
    const p = new Propiedad({
      id: deps.ids.nuevo(),
      ...datosValidos(e),
      estado,
      publicaciones: [],
      contactos: [],
      visitas: [],
      documentosEnviados: [],
      notas: [],
      cambios: [{ de: null, a: estado, origen, ocurridoEn: ahora }],
      senales: [],
      discrepancias: [],
      version: 0,
      creadaEn: ahora,
      actualizadaEn: ahora,
    });
    if (e.publicacion) p.agregarPublicacion(e.publicacion, deps);
    p.eventos.push({
      tipo: 'propiedad.creada',
      prioridad: 'baja',
      ocurridoEn: ahora,
      datos: { propiedadId: p.id, titulo: p.d.titulo, origen },
    });
    return p;
  }

  static reconstituir(d: DatosPropiedad): Propiedad {
    return new Propiedad(structuredClone(d));
  }

  get id(): string {
    return this.d.id;
  }

  get estado(): EstadoPropiedad {
    return this.d.estado;
  }

  datos(): DatosPropiedad {
    return structuredClone(this.d);
  }

  /** Eventos nuevos desde la última vez (el repositorio los guarda y publica). */
  sacarEventos(): EventoDePropiedad[] {
    const e = this.eventos;
    this.eventos = [];
    return e;
  }

  /** Las URL normalizadas de sus publicaciones: para buscar duplicados. */
  urlsClave(): string[] {
    return this.d.publicaciones.flatMap((p) => (p.urlClave ? [p.urlClave] : []));
  }

  transicionesPosibles(): EstadoPropiedad[] {
    return destinosDe(this.d.estado);
  }

  editar(e: EntradaDatos, reloj: Reloj): void {
    const { requisitos: _r, ...resto } = this.d;
    const base: DatosDeLaPropiedad = { ...resto, requisitos: this.d.requisitos };
    const nuevos = datosValidos(e, base);
    // Si cambió la dirección o la comuna, la ubicación geocodificada ya no vale (la manual se respeta).
    const movida =
      (nuevos.direccion !== this.d.direccion || nuevos.comuna !== this.d.comuna) &&
      this.d.ubicacion?.origen !== 'manual';
    Object.assign(this.d, nuevos);
    for (const k of Object.keys(base) as (keyof DatosDeLaPropiedad)[]) {
      if (!(k in nuevos)) delete (this.d as Partial<DatosPropiedad>)[k];
    }
    if (movida) delete this.d.ubicacion;
    this.tocar(reloj);
  }

  fijarUbicacion(u: { lat: unknown; lon: unknown; origen: Ubicacion['origen'] }, reloj: Reloj): void {
    const lat = numero('lat', u.lat, -90, 90);
    const lon = numero('lon', u.lon, -180, 180);
    // Una manual no la pisa una automática.
    if (this.d.ubicacion?.origen === 'manual' && u.origen !== 'manual') return;
    this.d.ubicacion = { lat, lon, origen: u.origen };
    this.tocar(reloj);
  }

  agregarPublicacion(
    p: { canalId: string; url?: unknown; precio?: EntradaDatos['precio'] },
    deps: Deps,
  ): void {
    const url = urlOpcional('url', p.url);
    const urlClave = url ? urlNormalizada(url) : undefined;
    if (urlClave && this.d.publicaciones.some((x) => x.urlClave === urlClave)) return;
    const precio = precioDe('publicacion.precio', p.precio);
    this.d.publicaciones.push({
      id: deps.ids.nuevo(),
      canalId: texto('canalId', p.canalId, 100),
      ...(url ? { url, urlClave } : {}),
      ...(precio ? { precio } : {}),
      vistaEn: deps.reloj.ahora(),
    });
    this.tocar(deps.reloj);
  }

  quitarPublicacion(id: string, reloj: Reloj): void {
    this.d.publicaciones = this.d.publicaciones.filter((p) => p.id !== id);
    this.tocar(reloj);
  }

  /** Une otra propiedad (un duplicado) a esta: sus publicaciones, contactos, notas y señales. */
  absorber(otra: Propiedad, reloj: Reloj): void {
    const o = otra.datos();
    for (const p of o.publicaciones)
      if (!p.urlClave || !this.d.publicaciones.some((x) => x.urlClave === p.urlClave))
        this.d.publicaciones.push(p);
    this.d.contactos.push(...o.contactos.filter((c) => !this.d.contactos.some((x) => mismoContacto(x, c))));
    this.d.notas.push(...o.notas);
    this.d.senales.push(...o.senales);
    this.d.visitas.push(...o.visitas);
    for (const k of Object.keys(o) as (keyof DatosDeLaPropiedad)[]) {
      const actual = (this.d as Partial<DatosPropiedad>)[k];
      if (actual === undefined && o[k] !== undefined)
        (this.d as unknown as Record<string, unknown>)[k] = o[k];
    }
    this.tocar(reloj);
  }

  // ── Contactos y conversaciones ──

  /** Agrega o completa un contacto (mismo teléfono, correo o nombre y rol). Devuelve su id. */
  registrarContacto(
    c: {
      nombre: unknown;
      rol?: unknown;
      telefono?: unknown;
      correo?: unknown;
      whatsapp?: unknown;
      enlace?: unknown;
      linkedin?: unknown;
      canalId?: unknown;
    },
    deps: Deps,
  ): string {
    const nuevo = {
      nombre: texto('nombre', c.nombre, 200),
      rol: uno('rol', ROLES_DE_CONTACTO, c.rol ?? 'otro'),
      ...opcional('telefono', telefonoOpcional('telefono', c.telefono)),
      ...opcional('correo', correoOpcional('correo', c.correo)),
      ...opcional('whatsapp', telefonoOpcional('whatsapp', c.whatsapp)),
      ...opcional('enlace', urlOpcional('enlace', c.enlace)),
      ...opcional('linkedin', urlOpcional('linkedin', c.linkedin)),
      ...opcional('canalId', textoOpcional('canalId', c.canalId, 100)),
    };
    const i = this.d.contactos.findIndex((x) => mismoContacto(x, nuevo));
    if (i >= 0) {
      const actual = this.d.contactos[i]!;
      // Completa lo que faltaba sin borrar lo que había; el rol «otro» no pisa uno más preciso.
      this.d.contactos[i] = {
        ...actual,
        ...Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== undefined)),
        rol: nuevo.rol === 'otro' ? actual.rol : nuevo.rol,
        interacciones: actual.interacciones,
      };
      this.tocar(deps.reloj);
      return actual.id;
    }
    const id = deps.ids.nuevo();
    this.d.contactos.push({ id, ...nuevo, interacciones: [] });
    this.tocar(deps.reloj);
    return id;
  }

  quitarContacto(id: string, reloj: Reloj): void {
    this.d.contactos = this.d.contactos.filter((c) => c.id !== id);
    this.tocar(reloj);
  }

  /** Registra un mensaje, llamada o nota con un contacto. Idempotente por referencia o por tipo, texto y día. */
  registrarInteraccion(
    contactoId: string,
    i: { tipo: unknown; resumen: unknown; ocurridaEn?: Date; canalId?: unknown; referenciaExterna?: unknown },
    origen: Origen,
    deps: Deps,
  ): boolean {
    const c = this.d.contactos.find((x) => x.id === contactoId);
    if (!c) throw new DatoInvalido('contactoId', 'Ese contacto no es de esta propiedad');
    const tipo = uno('tipo', TIPOS_DE_INTERACCION, i.tipo);
    const resumen = textoLargo('resumen', i.resumen, 2000);
    const ocurridaEn = i.ocurridaEn ?? deps.reloj.ahora();
    if (ocurridaEn.getTime() > deps.reloj.ahora().getTime() + 60_000)
      throw new DatoInvalido('ocurridaEn', 'La interacción no puede ser futura');
    const referencia = textoOpcional('referenciaExterna', i.referenciaExterna, 500);
    const dia = deps.reloj.fechaDe(ocurridaEn);
    const repetida = c.interacciones.some(
      (x) =>
        (referencia && x.referenciaExterna === referencia) ||
        (x.tipo === tipo && x.resumen === resumen && deps.reloj.fechaDe(x.ocurridaEn) === dia),
    );
    if (repetida) return false;
    const canalId = textoOpcional('canalId', i.canalId, 100) ?? c.canalId;
    const nueva: Interaccion = {
      id: deps.ids.nuevo(),
      tipo,
      resumen,
      ocurridaEn,
      origen,
      ...(canalId ? { canalId } : {}),
      ...(referencia ? { referenciaExterna: referencia } : {}),
    };
    const interacciones = [...c.interacciones, nueva].sort(
      (a, b) => a.ocurridaEn.getTime() - b.ocurridaEn.getTime(),
    );
    this.d.contactos = this.d.contactos.map((x) => (x.id === c.id ? { ...x, interacciones } : x));
    // Escribirle a alguien por primera vez es contactar la propiedad.
    if (tipo === 'mensaje_enviado' && this.d.estado === 'vista') this.mover('contactada', origen, deps.reloj);
    this.tocar(deps.reloj);
    return true;
  }

  /** Te toca responder si lo último que pasó con cualquiera de sus contactos fue un mensaje suyo. */
  pendiente(): 'responder' | 'esperando' | null {
    if (estaCerrada(this.d.estado)) return null;
    const ultimo = this.d.contactos
      .flatMap((c) => c.interacciones)
      .filter((i) => i.tipo === 'mensaje_enviado' || i.tipo === 'mensaje_recibido')
      .sort((a, b) => a.ocurridaEn.getTime() - b.ocurridaEn.getTime())
      .at(-1);
    if (!ultimo) return null;
    return ultimo.tipo === 'mensaje_recibido' ? 'responder' : 'esperando';
  }

  ultimaActividad(): Date {
    const fechas = [
      this.d.actualizadaEn,
      ...this.d.contactos.flatMap((c) => c.interacciones.map((i) => i.ocurridaEn)),
    ];
    return new Date(Math.max(...fechas.map((f) => f.getTime())));
  }

  // ── Estado ──

  cambiarEstado(
    a: unknown,
    p: { motivo?: unknown; fechaVisita?: unknown; documentos?: unknown },
    origen: Origen,
    deps: Deps,
  ): void {
    if (!esEstado(a)) throw new DatoInvalido('a', 'Estado desconocido');
    if (esTerminal(this.d.estado)) throw new EstadoTerminal();
    if (!puedeIrA(this.d.estado, a)) throw new TransicionInvalida(this.d.estado, a);
    const motivo = textoOpcional('motivo', p.motivo, 1000);
    if (PIDEN_MOTIVO.includes(a) && !motivo) throw new DatoInvalido('motivo', 'Cuéntame el motivo');
    if (a === 'visita_agendada') {
      if (vacio(p.fechaVisita)) throw new DatoInvalido('fechaVisita', 'La visita necesita fecha y hora');
      this.agendarVisita({ fecha: p.fechaVisita }, deps);
    }
    if (a === 'visitada') {
      const agendada = [...this.d.visitas].reverse().find((v) => v.estado === 'agendada');
      if (agendada)
        this.d.visitas = this.d.visitas.map((v) => (v.id === agendada.id ? { ...v, estado: 'hecha' } : v));
      else if (origen !== 'senal')
        this.abrirDiscrepancia(
          'visita_sin_registro',
          'Marcaste la visita como hecha sin una visita agendada',
          deps,
        );
    }
    if (a === 'en_evaluacion') {
      if (p.documentos !== undefined && !Array.isArray(p.documentos))
        throw new DatoInvalido('documentos', 'Los documentos van en una lista');
      const docs = ((p.documentos as unknown[] | undefined) ?? []).map((x) => texto('documentos', x, 200));
      for (const x of docs) if (!this.d.documentosEnviados.includes(x)) this.d.documentosEnviados.push(x);
    }
    if (origen === 'consola' || origen === 'ia') this.revisarContraSenales(a, deps);
    this.mover(a, origen, deps.reloj, motivo);
  }

  private mover(a: EstadoPropiedad, origen: Origen, reloj: Reloj, motivo?: string): void {
    const de = this.d.estado;
    this.d.estado = a;
    if (motivo && estaCerrada(a)) this.d.motivoCierre = motivo;
    if (a === 'vista') delete this.d.motivoCierre;
    const ahora = reloj.ahora();
    this.d.cambios.push({ de, a, origen, ocurridoEn: ahora, ...(motivo ? { motivo } : {}) });
    this.eventos.push({
      tipo: 'propiedad.estado_cambiado',
      prioridad: a === 'aprobada' || a === 'rechazada' || origen === 'senal' ? 'alta' : 'media',
      ocurridoEn: ahora,
      datos: { propiedadId: this.d.id, titulo: this.d.titulo, de, a, origen, ...(motivo ? { motivo } : {}) },
    });
    this.tocar(reloj);
  }

  /** Discrepancia si avanzas contra una señal reciente que dice que no (se cayó o la dieron a otro). */
  private revisarContraSenales(a: EstadoPropiedad, deps: Deps): void {
    const ahora = deps.reloj.ahora().getTime();
    const contraria = [...this.d.senales]
      .reverse()
      .find(
        (s) =>
          !s.aplicada &&
          ahora - s.recibidaEn.getTime() <= VENTANA_SENAL_MS &&
          (s.estadoSugerido === 'no_disponible' || s.estadoSugerido === 'rechazada'),
      );
    const avanza = (ordenDe(a) ?? -1) > (ordenDe(this.d.estado) ?? -1);
    if (contraria && avanza)
      this.abrirDiscrepancia(
        'contra_senal',
        `Moviste a ${a}, pero el ${contraria.recibidaEn.toISOString().slice(0, 10)} llegó: «${contraria.resumen}»`,
        deps,
      );
  }

  private abrirDiscrepancia(regla: Discrepancia['regla'], detalle: string, deps: Deps): void {
    const ahora = deps.reloj.ahora();
    this.d.discrepancias.push({
      id: deps.ids.nuevo(),
      regla,
      detalle,
      estado: 'abierta',
      detectadaEn: ahora,
    });
    this.eventos.push({
      tipo: 'propiedad.discrepancia',
      prioridad: 'media',
      ocurridoEn: ahora,
      datos: { propiedadId: this.d.id, titulo: this.d.titulo, regla, detalle },
    });
  }

  resolverDiscrepancia(id: string, reloj: Reloj): void {
    if (!this.d.discrepancias.some((x) => x.id === id))
      throw new DatoInvalido('discrepanciaId', 'Esa discrepancia no es de esta propiedad');
    this.d.discrepancias = this.d.discrepancias.map((x) => (x.id === id ? { ...x, estado: 'resuelta' } : x));
    this.tocar(reloj);
  }

  // ── Visitas, documentos y notas ──

  agendarVisita(v: { fecha: unknown; notas?: unknown }, deps: Deps): string {
    if (typeof v.fecha !== 'string' || Number.isNaN(Date.parse(v.fecha)))
      throw new DatoInvalido('fechaVisita', 'La visita necesita fecha y hora (ISO)');
    const id = deps.ids.nuevo();
    const notas = textoOpcional('notas', v.notas, 1000);
    this.d.visitas.push({ id, fecha: new Date(v.fecha), estado: 'agendada', ...(notas ? { notas } : {}) });
    this.tocar(deps.reloj);
    return id;
  }

  cambiarVisita(id: string, estado: unknown, reloj: Reloj): void {
    const e = uno('estado', ['agendada', 'hecha', 'cancelada'] as const, estado);
    if (!this.d.visitas.some((v) => v.id === id))
      throw new DatoInvalido('visitaId', 'Esa visita no es de esta propiedad');
    this.d.visitas = this.d.visitas.map((v) => (v.id === id ? { ...v, estado: e } : v));
    this.tocar(reloj);
  }

  agregarNota(t: unknown, deps: Deps): void {
    this.d.notas.push({
      id: deps.ids.nuevo(),
      texto: textoLargo('texto', t, 5000),
      creadaEn: deps.reloj.ahora(),
    });
    this.tocar(deps.reloj);
  }

  // ── Señales ──

  /**
   * Registra evidencia (un correo, un mensaje, lo que vio tu IA). Idempotente por referencia. Con una fuente
   * automática, confianza ≥ umbral y un salto válido, cambia el estado sola (D27); si no, queda como sugerencia.
   */
  registrarSenal(
    s: {
      fuente: unknown;
      resumen: unknown;
      estadoSugerido?: unknown;
      confianza?: unknown;
      canalId?: unknown;
      referenciaExterna?: unknown;
      remitente?: unknown;
      asunto?: unknown;
      recibidaEn?: unknown;
    },
    umbral: number,
    deps: Deps,
  ): { registrada: boolean; aplicada: boolean } {
    const referencia = textoOpcional('referenciaExterna', s.referenciaExterna, 500);
    if (referencia && this.d.senales.some((x) => x.referenciaExterna === referencia))
      return { registrada: false, aplicada: false };
    const fuente = uno('fuente', FUENTES_DE_SENAL, s.fuente);
    const sugerido = vacio(s.estadoSugerido) ? undefined : s.estadoSugerido;
    if (sugerido !== undefined && !esEstado(sugerido))
      throw new DatoInvalido('estadoSugerido', 'Estado desconocido');
    const confianza = vacio(s.confianza) ? 1 : numero('confianza', s.confianza, 0, 1);
    const recibidaEn = vacio(s.recibidaEn) ? deps.reloj.ahora() : new Date(String(s.recibidaEn));
    if (Number.isNaN(recibidaEn.getTime())) throw new DatoInvalido('recibidaEn', 'Fecha inválida');
    const aplicar =
      sugerido !== undefined &&
      FUENTES_AUTOMATICAS.includes(fuente) &&
      confianza >= umbral &&
      puedeIrA(this.d.estado, sugerido);
    const canalId = textoOpcional('canalId', s.canalId, 100);
    const remitente = textoOpcional('remitente', s.remitente, 300);
    const asunto = textoOpcional('asunto', s.asunto, 500);
    const resumen = textoLargo('resumen', s.resumen, 2000);
    this.d.senales.push({
      id: deps.ids.nuevo(),
      fuente,
      resumen,
      confianza,
      recibidaEn,
      aplicada: aplicar,
      ...(sugerido ? { estadoSugerido: sugerido } : {}),
      ...(canalId ? { canalId } : {}),
      ...(referencia ? { referenciaExterna: referencia } : {}),
      ...(remitente ? { remitente } : {}),
      ...(asunto ? { asunto } : {}),
    });
    this.eventos.push({
      tipo: 'propiedad.senal_registrada',
      prioridad: estaCerrada(this.d.estado) ? 'baja' : 'media',
      ocurridoEn: deps.reloj.ahora(),
      datos: { propiedadId: this.d.id, titulo: this.d.titulo, resumen, estadoSugerido: sugerido ?? null },
    });
    if (aplicar) {
      const motivo = PIDEN_MOTIVO.includes(sugerido) ? resumen.slice(0, 1000) : undefined;
      this.mover(sugerido, 'senal', deps.reloj, motivo);
    }
    this.tocar(deps.reloj);
    return { registrada: true, aplicada: aplicar };
  }

  /** Aplica a mano la sugerencia de una señal (la persona o su IA la confirman). */
  aplicarSenal(id: string, origen: Origen, deps: Deps): void {
    const s = this.d.senales.find((x) => x.id === id);
    if (!s) throw new DatoInvalido('senalId', 'Esa señal no es de esta propiedad');
    if (!s.estadoSugerido) throw new DatoInvalido('senalId', 'Esa señal no sugiere un estado');
    this.cambiarEstado(s.estadoSugerido, { motivo: s.resumen.slice(0, 1000) }, origen, deps);
    this.d.senales = this.d.senales.map((x) => (x.id === id ? { ...x, aplicada: true } : x));
  }

  private tocar(reloj: Reloj): void {
    this.d.actualizadaEn = reloj.ahora();
  }
}

function mismoContacto(
  a: Pick<ContactoPropiedad, 'nombre' | 'rol' | 'telefono' | 'correo' | 'whatsapp'>,
  b: Pick<ContactoPropiedad, 'nombre' | 'rol' | 'telefono' | 'correo' | 'whatsapp'>,
): boolean {
  if (a.telefono && (a.telefono === b.telefono || a.telefono === b.whatsapp)) return true;
  if (a.whatsapp && (a.whatsapp === b.whatsapp || a.whatsapp === b.telefono)) return true;
  if (a.correo && a.correo === b.correo) return true;
  return a.nombre.toLowerCase() === b.nombre.toLowerCase();
}
