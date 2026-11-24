import { AggregateRoot } from '../../compartido/dominio/aggregate-root';
import { ErrorDeDominio } from '../../compartido/dominio/error-de-dominio';
import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import { diasEntre, type Deps, type Fecha, type Reloj } from '../../compartido/dominio/puertos';
import {
  AvisoCerrado,
  DatoInvalido,
  EstadoTerminal,
  NoEncontrada,
  SenalDuplicada,
  TransicionInvalida,
} from './errores';
import {
  destinosDe,
  esDeAvance,
  esEstado,
  esTerminal,
  ordenDe,
  puedeIrA,
  type EstadoPostulacion,
} from './estado';
import { EVENTOS } from './eventos';
import {
  crearContacto,
  esUno,
  fechaValida,
  textoObligatorio,
  type AvisoResumen,
  type Canal,
  type Contacto,
  type Dinero,
  type Origen,
  type Plataforma,
} from './objetos-valor/valores';
import {
  FUENTES_DE_SENAL,
  RESULTADOS_DE_ENTREVISTA,
  TIPOS_DE_ENTREVISTA,
  type CambioDeEstado,
  type Discrepancia,
  type Entrevista,
  type FuenteDeSenal,
  type Nota,
  type ResultadoDeEntrevista,
  type Senal,
  type TipoDeEntrevista,
} from './partes';
import { calcularPrioridad } from './politica-de-prioridad';

/** Orígenes que son movimientos de una persona o de su IA: los revisa R13. */
const ORIGENES_MANUALES: readonly Origen[] = ['tablero', 'formulario', 'ia'];
const VENTANA_EVIDENCIA_MS = 30 * 86_400_000;
/** Fuentes que leen solas (el vigía); son las únicas que «aplicar señales seguras» puede aplicar (D27). */
export const FUENTES_AUTOMATICAS: readonly FuenteDeSenal[] = ['correo', 'plataforma'];
const MAX_NOTA = 5000;

export interface PostulacionDatos {
  id: string;
  aviso: AvisoResumen;
  estado: EstadoPostulacion;
  canal?: Canal;
  fechaPostulacion?: Fecha;
  sueldoPretendido?: Dinero;
  contactos: Contacto[];
  entrevistas: Entrevista[];
  notas: Nota[];
  historial: CambioDeEstado[];
  senales: Senal[];
  discrepancias: Discrepancia[];
  version: number;
  creadaEn: Date;
  actualizadaEn: Date;
}

export interface DatosSenal {
  fuente: FuenteDeSenal;
  plataforma?: Plataforma;
  resumen: string;
  estadoSugerido?: EstadoPostulacion;
  confianza: number;
  recibidaEn?: Date;
  referenciaExterna?: string;
  remitente?: string;
  asunto?: string;
}

export interface DatosEntrevista {
  fecha: Date;
  tipo: TipoDeEntrevista;
  con?: string;
  origen: Origen;
}

export interface DatosTransicion {
  motivo?: string;
  fechaPostulacion?: Fecha;
  canal?: Canal;
  origen: Origen;
}

/** Qué partes del agregado son nuevas o cambiaron desde que se cargó (las usa el repositorio). */
export interface Pendientes {
  nuevos: Set<string>;
  modificados: Set<string>;
  postulacion: boolean;
}

/** Raíz del agregado Postulación (PLAN §11.1). Todo cambio pasa por sus métodos. */
export class Postulacion extends AggregateRoot {
  private d: PostulacionDatos;
  private pendientes: Pendientes = { nuevos: new Set(), modificados: new Set(), postulacion: false };
  private esNueva = false;

  private constructor(datos: PostulacionDatos) {
    super();
    this.d = datos;
  }

  // ── Creación ─────────────────────────────────────────────────────────────

  /**
   * Crea una postulación. Con origen `importacion` admite cualquier estado (datos históricos, sin R2).
   * Con otros orígenes parte en `sin_decidir`, `por_postular` o `postulado` (este último con R2 y R3).
   */
  static crear(
    p: {
      aviso: AvisoResumen;
      estado?: EstadoPostulacion;
      sueldoPretendido?: Dinero;
      fechaPostulacion?: Fecha;
      canal?: Canal;
      motivo?: string;
      origen: Origen;
    },
    deps: Deps,
  ): Postulacion {
    const estado = p.estado ?? 'sin_decidir';
    if (!esEstado(estado)) throw new DatoInvalido('estado', 'Estado desconocido');
    const ahora = deps.reloj.ahora();
    const importada = p.origen === 'importacion';

    if (!importada && !['sin_decidir', 'por_postular', 'postulado'].includes(estado)) {
      throw new TransicionInvalida(
        'sin_decidir',
        estado,
        `Una postulación nueva no puede partir en ${estado}`,
      );
    }
    if (p.fechaPostulacion !== undefined) fechaValida('fechaPostulacion', p.fechaPostulacion);
    if (estado === 'postulado' && !importada) {
      Postulacion.exigirDatosDePostular(p.fechaPostulacion, p.canal, deps.reloj);
      if (Postulacion.avisoCerrado(p.aviso, deps.reloj)) throw new AvisoCerrado();
    }

    const cambio: CambioDeEstado = {
      id: deps.ids.nuevo(),
      de: null,
      a: estado,
      ...(p.motivo ? { motivo: p.motivo } : {}),
      origen: p.origen,
      ocurridoEn: ahora,
    };
    const post = new Postulacion({
      id: deps.ids.nuevo(),
      aviso: p.aviso,
      estado,
      ...(p.canal ? { canal: p.canal } : {}),
      ...(p.fechaPostulacion ? { fechaPostulacion: p.fechaPostulacion } : {}),
      ...(p.sueldoPretendido ? { sueldoPretendido: p.sueldoPretendido } : {}),
      contactos: [],
      entrevistas: [],
      notas: [],
      historial: [cambio],
      senales: [],
      discrepancias: [],
      version: 0,
      creadaEn: ahora,
      actualizadaEn: ahora,
    });
    post.esNueva = true;
    post.pendientes.nuevos.add(cambio.id);
    post.emitir(EVENTOS.creada, { postulacionId: post.id, aviso: p.aviso, estado }, deps.reloj);
    return post;
  }

  /** Vuelve a armar el agregado desde la persistencia, sin validar ni emitir eventos. */
  static reconstituir(datos: PostulacionDatos): Postulacion {
    return new Postulacion({ ...datos });
  }

  // ── Lectura ──────────────────────────────────────────────────────────────

  get id(): string {
    return this.d.id;
  }
  get estado(): EstadoPostulacion {
    return this.d.estado;
  }
  get version(): number {
    return this.d.version;
  }
  get aviso(): AvisoResumen {
    return this.d.aviso;
  }
  /** Copia de los datos para mappers y vistas. */
  datos(): Readonly<PostulacionDatos> {
    return structuredClone(this.d);
  }
  /** Lo que cambió desde que se cargó o se creó. */
  cambiosPendientes(): Readonly<Pendientes> & { creada: boolean } {
    return { ...this.pendientes, creada: this.esNueva };
  }
  /** El repositorio lo llama después de guardar. */
  marcarGuardada(nuevaVersion: number): void {
    this.d.version = nuevaVersion;
    this.pendientes = { nuevos: new Set(), modificados: new Set(), postulacion: false };
    this.esNueva = false;
  }

  prioridad(reloj: Reloj): Prioridad {
    return calcularPrioridad(this.d.estado, this.d.aviso.cierre, reloj.hoy());
  }

  /** Destinos válidos. Con reloj, quita los que el aviso cerrado impide (R3 y R6). */
  transicionesPosibles(reloj?: Reloj): EstadoPostulacion[] {
    const destinos = destinosDe(this.d.estado);
    if (!reloj || !Postulacion.avisoCerrado(this.d.aviso, reloj)) return destinos;
    return destinos.filter(
      (a) => a !== 'postulado' && !(this.d.estado === 'descartado' && a === 'sin_decidir'),
    );
  }

  // ── Comportamiento ───────────────────────────────────────────────────────

  /** R1 R2 R3 R5 R6 y R13. Valida todo antes de cambiar nada. */
  cambiarEstado(a: EstadoPostulacion, p: DatosTransicion, deps: Deps): CambioDeEstado {
    const de = this.d.estado;
    if (!esEstado(a)) throw new DatoInvalido('a', 'Estado desconocido');
    if (!puedeIrA(de, a)) throw new TransicionInvalida(de, a);

    let fechaPostulacion = this.d.fechaPostulacion;
    let canal = this.d.canal;
    if (a === 'postulado') {
      fechaPostulacion = p.fechaPostulacion ?? fechaPostulacion;
      canal = p.canal ?? canal;
      Postulacion.exigirDatosDePostular(fechaPostulacion, canal, deps.reloj);
      if (Postulacion.avisoCerrado(this.d.aviso, deps.reloj)) throw new AvisoCerrado();
    }
    let motivo = p.motivo?.trim() || undefined;
    if ((a === 'rechazado' || a === 'descartado') && !motivo) {
      throw new DatoInvalido('motivo', 'Hace falta un motivo para cerrar la postulación');
    }
    if (motivo && motivo.length > 1000) motivo = motivo.slice(0, 1000);
    if (de === 'descartado' && a === 'sin_decidir' && Postulacion.avisoCerrado(this.d.aviso, deps.reloj)) {
      throw new AvisoCerrado('No se puede reabrir: el aviso ya cerró');
    }

    const ahora = deps.reloj.ahora();
    const cambio: CambioDeEstado = {
      id: deps.ids.nuevo(),
      de,
      a,
      ...(motivo ? { motivo } : {}),
      origen: p.origen,
      ocurridoEn: ahora,
    };
    this.d.estado = a;
    if (fechaPostulacion) this.d.fechaPostulacion = fechaPostulacion;
    if (canal) this.d.canal = canal;
    this.d.historial.push(cambio);
    this.tocar(ahora);
    this.pendientes.nuevos.add(cambio.id);
    this.emitir(
      EVENTOS.estadoCambiado,
      { postulacionId: this.id, de, a, ...(motivo ? { motivo } : {}), origen: p.origen },
      deps.reloj,
    );

    if (ORIGENES_MANUALES.includes(p.origen)) this.revisarMovimiento(cambio, deps);
    return cambio;
  }

  /** R8 (se permite en terminal) y R11 (solo se aplica sola si es segura y está activado). */
  registrarSenal(datos: DatosSenal, deps: Deps & { aplicarSeguras: boolean; umbral: number }): Senal {
    if (!esUno(FUENTES_DE_SENAL, datos.fuente)) throw new DatoInvalido('fuente', 'Fuente desconocida');
    const resumen = textoObligatorio('resumen', datos.resumen, 1000);
    if (typeof datos.confianza !== 'number' || !(datos.confianza >= 0 && datos.confianza <= 1)) {
      throw new DatoInvalido('confianza', 'La confianza va de 0 a 1');
    }
    if (datos.estadoSugerido !== undefined && !esEstado(datos.estadoSugerido)) {
      throw new DatoInvalido('estadoSugerido', 'Estado desconocido');
    }
    const referencia = datos.referenciaExterna?.trim() || undefined;
    if (referencia && this.d.senales.some((s) => s.referenciaExterna === referencia)) {
      throw new SenalDuplicada(referencia);
    }

    const ahora = deps.reloj.ahora();
    let senal: Senal = {
      id: deps.ids.nuevo(),
      fuente: datos.fuente,
      plataforma: datos.plataforma ?? this.d.aviso.plataforma,
      resumen,
      ...(datos.estadoSugerido ? { estadoSugerido: datos.estadoSugerido } : {}),
      confianza: datos.confianza,
      recibidaEn: datos.recibidaEn ?? ahora,
      ...(referencia ? { referenciaExterna: referencia } : {}),
      ...(datos.remitente?.trim() ? { remitente: datos.remitente.trim().slice(0, 320) } : {}),
      ...(datos.asunto?.trim() ? { asunto: datos.asunto.trim().slice(0, 500) } : {}),
      aplicada: false,
    };
    this.d.senales.push(senal);
    this.pendientes.nuevos.add(senal.id);
    this.tocar(ahora);

    // D27: solo las fuentes automáticas se aplican solas; lo que registra una persona o su IA queda como sugerencia.
    const segura =
      deps.aplicarSeguras &&
      FUENTES_AUTOMATICAS.includes(senal.fuente) &&
      senal.estadoSugerido !== undefined &&
      senal.confianza >= deps.umbral;
    if (segura && this.intentarAplicar(senal, deps)) {
      senal = this.buscarSenal(senal.id);
    }
    this.emitir(
      EVENTOS.senalRegistrada,
      {
        postulacionId: this.id,
        senalId: senal.id,
        resumen: senal.resumen,
        ...(senal.estadoSugerido ? { estadoSugerido: senal.estadoSugerido } : {}),
        aplicada: senal.aplicada,
      },
      deps.reloj,
    );
    if (!senal.aplicada) this.revisarSenalNueva(senal, deps);
    return senal;
  }

  /** Aplica el estado sugerido por una señal (botón «Aplicar»). */
  aplicarSenal(senalId: string, deps: Deps): void {
    const senal = this.buscarSenal(senalId);
    if (senal.aplicada) throw new DatoInvalido('senalId', 'La señal ya está aplicada');
    if (!senal.estadoSugerido) throw new DatoInvalido('senalId', 'La señal no sugiere un estado');
    if (senal.estadoSugerido !== this.d.estado) {
      this.cambiarEstado(senal.estadoSugerido, this.transicionDesde(senal, deps.reloj), deps);
    }
    this.marcarSenalAplicada(senal.id, deps.reloj.ahora());
  }

  /** R14: confirmar el movimiento o corregir el estado. La discrepancia no se borra. */
  resolverDiscrepancia(
    id: string,
    decision: 'confirmar' | 'corregir',
    correccion: (Omit<DatosTransicion, 'origen'> & { a: EstadoPostulacion; origen?: Origen }) | undefined,
    deps: Deps,
  ): void {
    const disc = this.d.discrepancias.find((x) => x.id === id);
    if (!disc) throw new NoEncontrada('La discrepancia');
    if (disc.estado !== 'abierta')
      throw new DatoInvalido('discrepanciaId', 'La discrepancia ya está resuelta');
    if (decision !== 'confirmar' && decision !== 'corregir')
      throw new DatoInvalido('decision', 'Decisión desconocida');
    if (decision === 'corregir') {
      if (!correccion?.a) throw new DatoInvalido('a', 'Falta el estado al que corregir');
      const { a, origen, ...resto } = correccion;
      this.cambiarEstado(a, { ...resto, origen: origen ?? 'formulario' }, deps);
    }
    const ahora = deps.reloj.ahora();
    this.reemplazarDiscrepancia({
      ...disc,
      estado: decision === 'confirmar' ? 'confirmada' : 'corregida',
      resueltaEn: ahora,
    });
    this.tocar(ahora);
    this.emitir(
      EVENTOS.discrepanciaResuelta,
      { postulacionId: this.id, discrepanciaId: id, decision },
      deps.reloj,
    );
  }

  /** R9: las notas solo se agregan. */
  agregarNota(texto: string, deps: Deps): Nota {
    const limpio = typeof texto === 'string' ? texto.trim() : '';
    if (limpio.length < 1 || limpio.length > MAX_NOTA) {
      throw new DatoInvalido('texto', `La nota debe tener entre 1 y ${MAX_NOTA} caracteres`);
    }
    const ahora = deps.reloj.ahora();
    const nota: Nota = { id: deps.ids.nuevo(), texto: limpio, creadaEn: ahora };
    this.d.notas.push(nota);
    this.pendientes.nuevos.add(nota.id);
    this.tocar(ahora);
    return nota;
  }

  /** R8. */
  agregarContacto(
    datos: { nombre: unknown; rol?: unknown; email?: unknown; linkedin?: unknown },
    deps: Deps,
  ): Contacto {
    if (esTerminal(this.d.estado)) throw new EstadoTerminal('No se agregan contactos en un estado terminal');
    const contacto = crearContacto(deps.ids.nuevo(), datos);
    this.d.contactos.push(contacto);
    this.pendientes.nuevos.add(contacto.id);
    this.tocar(deps.reloj.ahora());
    return contacto;
  }

  /** R7 y R8: solo desde postulado, en proceso o entrevista; si no está en entrevista, la mueve. */
  agendarEntrevista(datos: DatosEntrevista, deps: Deps): Entrevista {
    if (esTerminal(this.d.estado))
      throw new EstadoTerminal('No se agendan entrevistas en un estado terminal');
    if (!['postulado', 'en_proceso', 'entrevista'].includes(this.d.estado)) {
      throw new TransicionInvalida(
        this.d.estado,
        'entrevista',
        'Solo se agenda una entrevista después de postular',
      );
    }
    if (!(datos.fecha instanceof Date) || Number.isNaN(datos.fecha.getTime())) {
      throw new DatoInvalido('fecha', 'La fecha de la entrevista no es válida');
    }
    if (!esUno(TIPOS_DE_ENTREVISTA, datos.tipo))
      throw new DatoInvalido('tipo', 'Tipo de entrevista desconocido');
    const con = datos.con?.trim() || undefined;

    if (this.d.estado !== 'entrevista') this.cambiarEstado('entrevista', { origen: datos.origen }, deps);
    const entrevista: Entrevista = {
      id: deps.ids.nuevo(),
      fecha: datos.fecha,
      tipo: datos.tipo,
      ...(con ? { con: con.slice(0, 200) } : {}),
      resultado: 'pendiente',
    };
    this.d.entrevistas.push(entrevista);
    this.pendientes.nuevos.add(entrevista.id);
    this.tocar(deps.reloj.ahora());
    this.emitir(
      EVENTOS.entrevistaAgendada,
      {
        postulacionId: this.id,
        entrevistaId: entrevista.id,
        fecha: entrevista.fecha.toISOString(),
        tipo: entrevista.tipo,
      },
      deps.reloj,
    );
    return entrevista;
  }

  registrarResultadoEntrevista(id: string, resultado: ResultadoDeEntrevista, reloj: Reloj): void {
    const i = this.d.entrevistas.findIndex((e) => e.id === id);
    if (i < 0) throw new NoEncontrada('La entrevista');
    if (!esUno(RESULTADOS_DE_ENTREVISTA, resultado))
      throw new DatoInvalido('resultado', 'Resultado desconocido');
    this.d.entrevistas[i] = { ...this.d.entrevistas[i]!, resultado };
    this.pendientes.modificados.add(id);
    this.tocar(reloj.ahora());
  }

  /** Edita canal, sueldo pretendido y cierre del aviso (`null` lo borra). */
  /** El servicio con IA liga el aviso analizado y su calce (PLAN §11.4, F2). */
  vincularAviso(p: { avisoId?: string; calce?: number }, reloj: Reloj): void {
    if (p.calce !== undefined && !(p.calce >= 0 && p.calce <= 1))
      throw new DatoInvalido('calce', 'El calce va de 0 a 1');
    const avisoId = p.avisoId?.trim();
    this.d.aviso = {
      ...this.d.aviso,
      ...(avisoId ? { avisoId: avisoId.slice(0, 100) } : {}),
      ...(p.calce !== undefined ? { calce: p.calce } : {}),
    };
    this.tocar(reloj.ahora());
  }

  editar(p: { canal?: Canal; sueldoPretendido?: Dinero | null; cierre?: Fecha | null }, reloj: Reloj): void {
    if (p.canal) this.d.canal = p.canal;
    if (p.sueldoPretendido === null) delete this.d.sueldoPretendido;
    else if (p.sueldoPretendido) this.d.sueldoPretendido = p.sueldoPretendido;
    if (p.cierre === null) {
      const { cierre: _quitado, ...resto } = this.d.aviso;
      this.d.aviso = resto;
    } else if (p.cierre !== undefined) {
      this.d.aviso = { ...this.d.aviso, cierre: fechaValida('aviso.cierre', p.cierre) };
    }
    this.tocar(reloj.ahora());
  }

  // ── R13 sin IA (backend.md §3.2) ─────────────────────────────────────────

  /** Revisa un movimiento manual contra la última señal no aplicada de los últimos 30 días. */
  private revisarMovimiento(cambio: CambioDeEstado, deps: Deps): void {
    const desde = deps.reloj.ahora().getTime() - VENTANA_EVIDENCIA_MS;
    const recientes = this.d.senales.filter((s) => s.recibidaEn.getTime() >= desde);
    const ultima = recientes
      .filter((s) => !s.aplicada && s.estadoSugerido)
      .sort((x, y) => y.recibidaEn.getTime() - x.recibidaEn.getTime())[0];

    if (ultima && this.contradice(cambio, ultima.estadoSugerido!)) {
      this.abrirDiscrepancia(cambio, ultima, deps);
    } else if (
      (cambio.a === 'entrevista' || cambio.a === 'oferta') &&
      cambio.origen === 'tablero' &&
      recientes.length === 0
    ) {
      this.abrirDiscrepancia(cambio, undefined, deps);
    }
  }

  /** Una señal nueva que contradice el último movimiento manual también abre una discrepancia. */
  private revisarSenalNueva(senal: Senal, deps: Deps): void {
    if (!senal.estadoSugerido) return;
    const ultimo = this.d.historial[this.d.historial.length - 1];
    if (!ultimo || !ORIGENES_MANUALES.includes(ultimo.origen)) return;
    if (deps.reloj.ahora().getTime() - ultimo.ocurridoEn.getTime() > VENTANA_EVIDENCIA_MS) return;
    if (this.contradice(ultimo, senal.estadoSugerido)) this.abrirDiscrepancia(ultimo, senal, deps);
  }

  private contradice(cambio: CambioDeEstado, sugerido: EstadoPostulacion): boolean {
    if (esDeAvance(cambio.a) && sugerido === 'rechazado') return true;
    if (cambio.a === 'rechazado' || cambio.a === 'descartado') {
      const previo = cambio.de ? ordenDe(cambio.de) : undefined;
      const sug = ordenDe(sugerido);
      return esDeAvance(sugerido) && sug !== undefined && (previo === undefined || sug > previo);
    }
    return false;
  }

  private abrirDiscrepancia(cambio: CambioDeEstado, senal: Senal | undefined, deps: Deps): void {
    const repetida = this.d.discrepancias.some(
      (x) => x.estado === 'abierta' && x.cambioId === cambio.id && x.senalId === senal?.id,
    );
    if (repetida) return;
    const regla = !senal
      ? 'sin_evidencia'
      : senal.estadoSugerido === 'rechazado'
        ? 'senal_de_rechazo'
        : 'senal_de_avance';
    const detalle = !senal
      ? `Moviste a ${cambio.a} sin ninguna señal en los últimos 30 días`
      : `Moviste a ${cambio.a} y la señal «${senal.resumen}» sugiere ${senal.estadoSugerido}`;
    const ahora = deps.reloj.ahora();
    const disc: Discrepancia = {
      id: deps.ids.nuevo(),
      cambioId: cambio.id,
      ...(senal ? { senalId: senal.id } : {}),
      regla,
      severidad: senal ? 'normal' : 'baja',
      detalle,
      estado: 'abierta',
      detectadaEn: ahora,
    };
    this.d.discrepancias.push(disc);
    this.pendientes.nuevos.add(disc.id);
    this.tocar(ahora);
    this.emitir(
      EVENTOS.discrepanciaDetectada,
      { postulacionId: this.id, discrepanciaId: disc.id, detalle, regla, severidad: disc.severidad },
      deps.reloj,
    );
  }

  // ── Ayudas internas ──────────────────────────────────────────────────────

  private intentarAplicar(senal: Senal, deps: Deps): boolean {
    try {
      if (senal.estadoSugerido !== this.d.estado) {
        this.cambiarEstado(senal.estadoSugerido!, this.transicionDesde(senal, deps.reloj), deps);
      }
      this.marcarSenalAplicada(senal.id, deps.reloj.ahora());
      return true;
    } catch (e) {
      if (e instanceof ErrorDeDominio) return false; // queda como sugerencia
      throw e;
    }
  }

  /**
   * Una señal de «postulado» trae la evidencia de cuándo y por dónde: la fecha es el día en que llegó
   * (nunca futura) y el canal, el portal de su plataforma (o la del aviso si no se supo),
   * salvo que la postulación ya tenga los suyos.
   */
  private transicionDesde(senal: Senal, reloj: Reloj) {
    if (senal.estadoSugerido !== 'postulado') return { motivo: senal.resumen, origen: 'senal' as const };
    const dia = reloj.fechaDe(senal.recibidaEn);
    const hoy = reloj.hoy();
    return {
      motivo: senal.resumen,
      origen: 'senal' as const,
      fechaPostulacion: this.d.fechaPostulacion ?? (dia > hoy ? hoy : dia),
      canal: this.d.canal ?? {
        tipo: 'portal' as const,
        valor: senal.plataforma === 'otra' ? this.d.aviso.plataforma : senal.plataforma,
      },
    };
  }

  private marcarSenalAplicada(id: string, ahora: Date): void {
    const i = this.d.senales.findIndex((s) => s.id === id);
    this.d.senales[i] = { ...this.d.senales[i]!, aplicada: true };
    if (!this.pendientes.nuevos.has(id)) this.pendientes.modificados.add(id);
    this.tocar(ahora);
  }

  private buscarSenal(id: string): Senal {
    const s = this.d.senales.find((x) => x.id === id);
    if (!s) throw new NoEncontrada('La señal');
    return s;
  }

  private reemplazarDiscrepancia(disc: Discrepancia): void {
    const i = this.d.discrepancias.findIndex((x) => x.id === disc.id);
    this.d.discrepancias[i] = disc;
    if (!this.pendientes.nuevos.has(disc.id)) this.pendientes.modificados.add(disc.id);
  }

  private tocar(ahora: Date): void {
    this.d.actualizadaEn = ahora;
    this.pendientes.postulacion = true;
  }

  private emitir(tipo: string, datos: object, reloj: Reloj): void {
    this.registrar({ tipo, version: 1, ocurridoEn: reloj.ahora(), prioridad: this.prioridad(reloj), datos });
  }

  private static exigirDatosDePostular(
    fecha: Fecha | undefined,
    canal: Canal | undefined,
    reloj: Reloj,
  ): void {
    if (!fecha) throw new DatoInvalido('fechaPostulacion', 'Hace falta la fecha de postulación');
    fechaValida('fechaPostulacion', fecha);
    if (fecha > reloj.hoy())
      throw new DatoInvalido('fechaPostulacion', 'La fecha de postulación no puede ser futura');
    if (!canal) throw new DatoInvalido('canal', 'Hace falta el canal por el que postulaste');
  }

  private static avisoCerrado(aviso: AvisoResumen, reloj: Reloj): boolean {
    return aviso.cierre !== undefined && diasEntre(reloj.hoy(), aviso.cierre) < 0;
  }
}
