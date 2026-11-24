import type { Deps, Fecha, GeneradorId, Reloj } from '../../compartido/dominio/puertos';
import {
  calcularCalce,
  CRITERIOS_SUGERIDOS,
  describir,
  precioEnPesos,
  type Calce,
  type Criterio,
  type DatosBusqueda,
} from '../dominio/busqueda';
import { Canal, type DatosCanal } from '../dominio/canal';
import { esCandidata } from '../dominio/duplicados';
import { estaCerrada, ESTADOS, type EstadoPropiedad } from '../dominio/estado';
import { Propiedad, type DatosPropiedad, type EntradaDatos } from '../dominio/propiedad';
import {
  ConflictoDeVersion,
  DatoInvalido,
  fecha as fechaValida,
  FUENTES_DE_SENAL,
  NoEncontrado,
  numero,
  PropiedadDuplicada,
  texto,
  textoOpcional,
  uno,
  urlNormalizada,
  urlOpcional,
  vacio,
  type Origen,
} from '../dominio/valores';
import type {
  AjustesArriendos,
  BandejaArriendos,
  BusquedaRepositorio,
  CanalRepositorio,
  Geocodificador,
  PropiedadRepositorio,
  SenalPendiente,
} from './puertos';

export interface ContextoDeArriendos {
  propiedades: PropiedadRepositorio;
  canales: CanalRepositorio;
  busqueda: BusquedaRepositorio;
  bandeja: BandejaArriendos;
  ajustes: AjustesArriendos;
  geocodificador?: Geocodificador;
  reloj: Reloj;
  ids: GeneradorId;
}

// ── Vistas ──

export interface VistaPropiedad {
  id: string;
  titulo: string;
  tipo: string;
  estado: EstadoPropiedad;
  transicionesPosibles: EstadoPropiedad[];
  comuna: string | null;
  direccion: string | null;
  ubicacion: DatosPropiedad['ubicacion'] | null;
  precio: DatosPropiedad['precio'] | null;
  /** Arriendo en pesos (con la UF del día si está en UF). */
  precioPesos: number | null;
  gastosComunes: number | null;
  dormitorios: number | null;
  banos: number | null;
  m2: number | null;
  calce: Calce;
  pendiente: 'responder' | 'esperando' | null;
  canales: string[];
  cantidadContactos: number;
  proximaVisita: string | null;
  discrepanciasAbiertas: number;
  senalesSinAplicar: number;
  motivoCierre: string | null;
  version: number;
  actualizadaEn: string;
}

type ConFechasEnTexto<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | undefined
      ? string | undefined
      : T[K] extends readonly (infer U)[]
        ? ConFechasEnTexto<U>[]
        : T[K] extends object | undefined
          ? ConFechasEnTexto<T[K]>
          : T[K];
};

export type VistaPropiedadDetalle = VistaPropiedad &
  Omit<ConFechasEnTexto<DatosPropiedad>, keyof VistaPropiedad | 'creadaEn'> & { creadaEn: string };

export interface ResumenArriendos {
  total: number;
  abiertas: number;
  porEstado: Record<EstadoPropiedad, number>;
  porResponder: number;
  bandeja: number;
  discrepancias: number;
}

/** Fechas a ISO de forma profunda (las vistas salen por JSON). */
function enTexto<T>(v: T): ConFechasEnTexto<T> {
  return JSON.parse(JSON.stringify(v)) as ConFechasEnTexto<T>;
}

const deps = (c: ContextoDeArriendos): Deps => ({ reloj: c.reloj, ids: c.ids });

export class CasosDeArriendos {
  constructor(private readonly c: ContextoDeArriendos) {}

  // ── Lectura ──

  private async contextoDeCalce(): Promise<{ busqueda: DatosBusqueda; uf: number | null }> {
    const [b, uf] = await Promise.all([this.c.busqueda.leer(), this.c.ajustes.uf()]);
    return { busqueda: b.datos(), uf: uf?.valor ?? null };
  }

  private vista(p: Propiedad, cx: { busqueda: DatosBusqueda; uf: number | null }): VistaPropiedad {
    const d = p.datos();
    const ahora = this.c.reloj.ahora().getTime();
    const proxima = d.visitas
      .filter((v) => v.estado === 'agendada' && v.fecha.getTime() >= ahora - 3_600_000)
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())[0];
    return {
      id: d.id,
      titulo: d.titulo,
      tipo: d.tipo,
      estado: d.estado,
      transicionesPosibles: p.transicionesPosibles(),
      comuna: d.comuna ?? null,
      direccion: d.direccion ?? null,
      ubicacion: d.ubicacion ?? null,
      precio: d.precio ?? null,
      precioPesos: precioEnPesos(d, cx.uf),
      gastosComunes: d.gastosComunes ?? null,
      dormitorios: d.dormitorios ?? null,
      banos: d.banos ?? null,
      m2: d.m2Utiles ?? d.m2Totales ?? null,
      calce: calcularCalce(d, cx.busqueda, cx.uf),
      pendiente: p.pendiente(),
      canales: [...new Set(d.publicaciones.map((x) => x.canalId))],
      cantidadContactos: d.contactos.length,
      proximaVisita: proxima ? proxima.fecha.toISOString() : null,
      discrepanciasAbiertas: d.discrepancias.filter((x) => x.estado === 'abierta').length,
      senalesSinAplicar: d.senales.filter((x) => !x.aplicada && x.estadoSugerido).length,
      motivoCierre: d.motivoCierre ?? null,
      version: d.version,
      actualizadaEn: p.ultimaActividad().toISOString(),
    };
  }

  private detalle(p: Propiedad, cx: { busqueda: DatosBusqueda; uf: number | null }): VistaPropiedadDetalle {
    const d = enTexto(p.datos());
    const v = this.vista(p, cx);
    return {
      ...d,
      ...v,
      senales: [...d.senales].reverse(),
      cambios: [...d.cambios].reverse(),
      notas: [...d.notas].reverse(),
    } as VistaPropiedadDetalle;
  }

  private async cargar(id: string): Promise<Propiedad> {
    const p = await this.c.propiedades.porId(id);
    if (!p) throw new NoEncontrado('La propiedad');
    return p;
  }

  async listar(
    f: {
      estado?: string;
      texto?: string;
      canal?: string;
      abiertas?: boolean;
      pendiente?: string;
    } = {},
  ): Promise<{ items: VistaPropiedad[]; resumen: ResumenArriendos }> {
    const [todas, cx, bandeja] = await Promise.all([
      this.c.propiedades.todas(),
      this.contextoDeCalce(),
      this.c.bandeja.pendientes(),
    ]);
    const vistas = todas.map((p) => this.vista(p, cx));
    const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoPropiedad, number>;
    for (const v of vistas) porEstado[v.estado]++;
    const resumen: ResumenArriendos = {
      total: vistas.length,
      abiertas: vistas.filter((v) => !estaCerrada(v.estado)).length,
      porEstado,
      porResponder: vistas.filter((v) => v.pendiente === 'responder').length,
      bandeja: bandeja.length,
      discrepancias: vistas.reduce((n, v) => n + v.discrepanciasAbiertas, 0),
    };
    const q = f.texto?.trim().toLowerCase();
    const items = vistas
      .filter((v) => !f.estado || v.estado === f.estado)
      .filter((v) => !f.abiertas || !estaCerrada(v.estado))
      .filter((v) => !f.canal || v.canales.includes(f.canal))
      .filter((v) => !f.pendiente || v.pendiente === f.pendiente)
      .filter((v) => !q || `${v.titulo} ${v.comuna ?? ''} ${v.direccion ?? ''}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(b.pendiente === 'responder') - Number(a.pendiente === 'responder') ||
          b.actualizadaEn.localeCompare(a.actualizadaEn),
      );
    return { items, resumen };
  }

  async ver(id: string): Promise<VistaPropiedadDetalle> {
    return this.detalle(await this.cargar(id), await this.contextoDeCalce());
  }

  // ── Duplicados ──

  /** Antes de crear (P4): la misma URL es segura; la misma dirección o un pin a menos de 30 m, candidata. */
  async buscarDuplicados(e: {
    url?: unknown;
    direccion?: unknown;
    comuna?: unknown;
    dormitorios?: unknown;
  }): Promise<{ seguro: VistaPropiedad | null; candidatos: VistaPropiedad[] }> {
    const cx = await this.contextoDeCalce();
    const url = urlOpcional('url', e.url);
    const seguro = url ? await this.c.propiedades.porUrlClave(urlNormalizada(url)) : null;
    const comparable = {
      ...(textoOpcional('direccion', e.direccion, 300) ? { direccion: String(e.direccion) } : {}),
      ...(textoOpcional('comuna', e.comuna, 100) ? { comuna: String(e.comuna) } : {}),
      ...(vacio(e.dormitorios) ? {} : { dormitorios: numero('dormitorios', e.dormitorios, 0, 50) }),
    };
    const candidatos = comparable.direccion
      ? (await this.c.propiedades.todas()).filter(
          (p) => p.id !== seguro?.id && esCandidata(comparable, p.datos()),
        )
      : [];
    return {
      seguro: seguro ? this.vista(seguro, cx) : null,
      candidatos: candidatos.map((p) => this.vista(p, cx)),
    };
  }

  // ── Escritura ──

  private async guardar(p: Propiedad, versionLeida: number | null): Promise<void> {
    await this.c.propiedades.guardar(p, versionLeida);
  }

  private async conVersion(id: string, version: unknown): Promise<{ p: Propiedad; v: number }> {
    const p = await this.cargar(id);
    const v = p.datos().version;
    if (version !== undefined && version !== null && version !== v) throw new ConflictoDeVersion();
    return { p, v };
  }

  private async validarCanal(id: unknown): Promise<string> {
    const canalId = texto('canalId', id, 60);
    if (!(await this.c.canales.porId(canalId)))
      throw new DatoInvalido('canalId', `No hay un canal «${canalId}»: créalo primero (registrar_canal)`);
    return canalId;
  }

  /** Canal de una URL por sus dominios; si no se reconoce, «otro». */
  private async canalDeUrl(url: string | undefined): Promise<string | undefined> {
    if (!url) return undefined;
    const canales = await this.c.canales.todos();
    return canales.find((c) => c.reconoce(url))?.id;
  }

  /**
   * Crea una propiedad. Con la misma URL que otra ya seguida: error YA_EXISTE con su id, salvo `unirA` (suma la
   * publicación a esa). Devuelve también los posibles duplicados por dirección, para que la persona decida.
   */
  async crear(
    e: EntradaDatos & {
      estado?: unknown;
      publicacion?: { canalId?: unknown; url?: unknown; precio?: EntradaDatos['precio'] };
      contactos?: unknown[];
      nota?: unknown;
      unirA?: string;
    },
    origen: Origen,
  ): Promise<{ propiedad: VistaPropiedadDetalle; posiblesDuplicados: VistaPropiedad[]; unida: boolean }> {
    const url = urlOpcional('publicacion.url', e.publicacion?.url);
    const canalId = e.publicacion
      ? e.publicacion.canalId !== undefined && e.publicacion.canalId !== ''
        ? await this.validarCanal(e.publicacion.canalId)
        : ((await this.canalDeUrl(url)) ?? (await this.canalOtro()))
      : undefined;
    if (url) {
      const existente = await this.c.propiedades.porUrlClave(urlNormalizada(url));
      if (existente && !e.unirA) throw new PropiedadDuplicada(existente.id);
    }
    if (e.unirA) {
      const { p, v } = await this.conVersion(e.unirA, undefined);
      if (canalId) p.agregarPublicacion({ canalId, url, precio: e.publicacion?.precio }, deps(this.c));
      this.sumarContactos(p, e.contactos);
      if (!vacio(e.nota)) p.agregarNota(e.nota, deps(this.c));
      await this.guardar(p, v);
      return { propiedad: await this.ver(p.id), posiblesDuplicados: [], unida: true };
    }
    const { publicacion: _p, contactos: _c, nota: _n, unirA: _u, ...datos } = e;
    const p = Propiedad.crear(
      { ...datos, ...(canalId ? { publicacion: { canalId, url } } : {}) },
      origen,
      deps(this.c),
    );
    if (e.publicacion?.precio && canalId) {
      // El precio publicado también queda como precio de la propiedad si no traía uno.
      if (!p.datos().precio) p.editar({ precio: e.publicacion.precio }, this.c.reloj);
    }
    this.sumarContactos(p, e.contactos);
    if (!vacio(e.nota)) p.agregarNota(e.nota, deps(this.c));
    const candidatos = (await this.c.propiedades.todas()).filter((x) => esCandidata(p.datos(), x.datos()));
    await this.guardar(p, null);
    void this.geocodificar(p.id);
    const cx = await this.contextoDeCalce();
    return {
      propiedad: this.detalle((await this.c.propiedades.porId(p.id))!, cx),
      posiblesDuplicados: candidatos.map((x) => this.vista(x, cx)),
      unida: false,
    };
  }

  private async canalOtro(): Promise<string> {
    const otro = await this.c.canales.porId('otro');
    if (otro) return 'otro';
    const c = Canal.crear({ id: 'otro', nombre: 'Otro', tipo: 'otro' }, deps(this.c));
    await this.c.canales.guardar(c);
    return 'otro';
  }

  private sumarContactos(p: Propiedad, contactos: unknown[] | undefined): void {
    if (contactos === undefined) return;
    if (!Array.isArray(contactos)) throw new DatoInvalido('contactos', 'Los contactos van en una lista');
    for (const c of contactos)
      p.registrarContacto(c as Parameters<Propiedad['registrarContacto']>[0], deps(this.c));
  }

  async editar(id: string, datos: EntradaDatos & { version?: unknown }): Promise<VistaPropiedadDetalle> {
    const { version, ...resto } = datos;
    const { p, v } = await this.conVersion(id, version);
    const antes = p.datos();
    p.editar(resto, this.c.reloj);
    await this.guardar(p, v);
    if (antes.direccion !== p.datos().direccion || antes.comuna !== p.datos().comuna)
      void this.geocodificar(id);
    return this.ver(id);
  }

  async cambiarEstado(
    id: string,
    e: { a: unknown; motivo?: unknown; fechaVisita?: unknown; documentos?: unknown; version?: unknown },
    origen: Origen,
  ): Promise<VistaPropiedadDetalle> {
    const { p, v } = await this.conVersion(id, e.version);
    p.cambiarEstado(e.a, e, origen, deps(this.c));
    await this.guardar(p, v);
    return this.ver(id);
  }

  async agregarPublicacion(
    id: string,
    e: { canalId?: unknown; url?: unknown; precio?: EntradaDatos['precio'] },
  ): Promise<VistaPropiedadDetalle> {
    const url = urlOpcional('url', e.url);
    if (url) {
      const otra = await this.c.propiedades.porUrlClave(urlNormalizada(url));
      if (otra && otra.id !== id) throw new PropiedadDuplicada(otra.id);
    }
    const canalId = vacio(e.canalId)
      ? ((await this.canalDeUrl(url)) ?? (await this.canalOtro()))
      : await this.validarCanal(e.canalId);
    const { p, v } = await this.conVersion(id, undefined);
    p.agregarPublicacion({ canalId, url, precio: e.precio }, deps(this.c));
    await this.guardar(p, v);
    return this.ver(id);
  }

  /** Une un duplicado: `origenId` se suma a `destinoId` y desaparece. */
  async unir(destinoId: string, origenId: string): Promise<VistaPropiedadDetalle> {
    if (destinoId === origenId) throw new DatoInvalido('origenId', 'Es la misma propiedad');
    const { p, v } = await this.conVersion(destinoId, undefined);
    const otra = await this.cargar(origenId);
    p.absorber(otra, this.c.reloj);
    await this.c.propiedades.borrar(origenId);
    await this.guardar(p, v);
    return this.ver(destinoId);
  }

  async borrar(id: string): Promise<void> {
    await this.cargar(id);
    await this.c.propiedades.borrar(id);
  }

  async registrarContacto(
    id: string,
    contacto: Parameters<Propiedad['registrarContacto']>[0],
  ): Promise<{ contactoId: string; propiedad: VistaPropiedadDetalle }> {
    if (!vacio(contacto.canalId)) await this.validarCanal(contacto.canalId);
    const { p, v } = await this.conVersion(id, undefined);
    const contactoId = p.registrarContacto(contacto, deps(this.c));
    await this.guardar(p, v);
    return { contactoId, propiedad: await this.ver(id) };
  }

  async quitarContacto(id: string, contactoId: string): Promise<VistaPropiedadDetalle> {
    const { p, v } = await this.conVersion(id, undefined);
    p.quitarContacto(contactoId, this.c.reloj);
    await this.guardar(p, v);
    return this.ver(id);
  }

  /** Mensaje, llamada o nota con un contacto. Si no hay `contactoId`, crea o reconoce el contacto por sus datos. */
  async registrarInteraccion(
    id: string,
    e: {
      contactoId?: string;
      contacto?: Parameters<Propiedad['registrarContacto']>[0];
      tipo: unknown;
      resumen: unknown;
      ocurridaEn?: unknown;
      canalId?: unknown;
      referenciaExterna?: unknown;
    },
    origen: Origen,
  ): Promise<{ registrada: boolean; propiedad: VistaPropiedadDetalle }> {
    if (!vacio(e.canalId)) await this.validarCanal(e.canalId);
    const { p, v } = await this.conVersion(id, undefined);
    let contactoId = e.contactoId;
    if (!contactoId) {
      if (!e.contacto)
        throw new DatoInvalido('contactoId', 'Di con quién (contactoId o los datos del contacto)');
      contactoId = p.registrarContacto(e.contacto, deps(this.c));
    }
    let ocurridaEn: Date | undefined;
    if (!vacio(e.ocurridaEn)) {
      ocurridaEn = new Date(String(e.ocurridaEn));
      if (Number.isNaN(ocurridaEn.getTime())) throw new DatoInvalido('ocurridaEn', 'Fecha inválida');
    }
    const registrada = p.registrarInteraccion(
      contactoId,
      {
        tipo: e.tipo,
        resumen: e.resumen,
        canalId: e.canalId,
        referenciaExterna: e.referenciaExterna,
        ...(ocurridaEn ? { ocurridaEn } : {}),
      },
      origen,
      deps(this.c),
    );
    await this.guardar(p, v);
    return { registrada, propiedad: await this.ver(id) };
  }

  async agendarVisita(id: string, e: { fecha: unknown; notas?: unknown }): Promise<VistaPropiedadDetalle> {
    const { p, v } = await this.conVersion(id, undefined);
    if (p.estado === 'vista' || p.estado === 'contactada')
      p.cambiarEstado('visita_agendada', { fechaVisita: e.fecha }, 'consola', deps(this.c));
    else p.agendarVisita(e, deps(this.c));
    await this.guardar(p, v);
    return this.ver(id);
  }

  async cambiarVisita(id: string, visitaId: string, estado: unknown): Promise<VistaPropiedadDetalle> {
    const { p, v } = await this.conVersion(id, undefined);
    p.cambiarVisita(visitaId, estado, this.c.reloj);
    await this.guardar(p, v);
    return this.ver(id);
  }

  async agregarNota(id: string, textoNota: unknown): Promise<VistaPropiedadDetalle> {
    const { p, v } = await this.conVersion(id, undefined);
    p.agregarNota(textoNota, deps(this.c));
    await this.guardar(p, v);
    return this.ver(id);
  }

  async resolverDiscrepancia(id: string, discrepanciaId: string): Promise<VistaPropiedadDetalle> {
    const { p, v } = await this.conVersion(id, undefined);
    p.resolverDiscrepancia(discrepanciaId, this.c.reloj);
    await this.guardar(p, v);
    return this.ver(id);
  }

  async aplicarSenal(id: string, senalId: string, origen: Origen): Promise<VistaPropiedadDetalle> {
    const { p, v } = await this.conVersion(id, undefined);
    p.aplicarSenal(senalId, origen, deps(this.c));
    await this.guardar(p, v);
    return this.ver(id);
  }

  /** Mueve el pin a mano (A-D18): queda fijo y la geocodificación no lo vuelve a mover. */
  async fijarUbicacion(id: string, lat: unknown, lon: unknown): Promise<VistaPropiedadDetalle> {
    const { p, v } = await this.conVersion(id, undefined);
    p.fijarUbicacion({ lat, lon, origen: 'manual' }, this.c.reloj);
    await this.guardar(p, v);
    return this.ver(id);
  }

  /** Busca el punto de la dirección (si hay geocodificador) o del centro de la comuna. Nunca falla hacia afuera. */
  async geocodificar(id: string): Promise<boolean> {
    if (!this.c.geocodificador) return false;
    try {
      const p = await this.c.propiedades.porId(id);
      const d = p?.datos();
      if (!p || !d || d.ubicacion?.origen === 'manual' || (!d.direccion && !d.comuna)) return false;
      const exacta = d.direccion ? await this.c.geocodificador.ubicar(d.direccion, d.comuna) : null;
      const punto = exacta ?? (d.comuna ? await this.c.geocodificador.ubicar(d.comuna) : null);
      if (!punto) return false;
      const fresca = await this.c.propiedades.porId(id);
      if (!fresca) return false;
      const version = fresca.datos().version;
      fresca.fijarUbicacion({ ...punto, origen: exacta ? 'geocodificada' : 'comuna' }, this.c.reloj);
      await this.guardar(fresca, version);
      return true;
    } catch {
      return false;
    }
  }

  // ── Señales y Bandeja ──

  /**
   * Evidencia de un arriendo (correo, mensaje, lo que vio tu IA). Va a la propiedad si se sabe cuál (por id o por la
   * URL de una publicación); si no, a la Bandeja de Arriendos.
   */
  async registrarSenal(e: {
    propiedadId?: string;
    url?: unknown;
    fuente: unknown;
    resumen: unknown;
    estadoSugerido?: unknown;
    confianza?: unknown;
    canalId?: unknown;
    referenciaExterna?: unknown;
    remitente?: unknown;
    asunto?: unknown;
    recibidaEn?: unknown;
    direccion?: unknown;
    comuna?: unknown;
    contacto?: { nombre?: unknown; telefono?: unknown; correo?: unknown };
  }): Promise<{
    destino: 'propiedad' | 'bandeja' | 'repetida';
    propiedadId?: string;
    aplicada?: boolean;
    senalId?: string;
  }> {
    const url = urlOpcional('url', e.url);
    let p = e.propiedadId ? await this.cargar(e.propiedadId) : null;
    if (!p && url) p = await this.c.propiedades.porUrlClave(urlNormalizada(url));
    if (p) {
      const v = p.datos().version;
      const r = p.registrarSenal(e, await this.c.ajustes.umbral(), deps(this.c));
      if (!r.registrada) return { destino: 'repetida', propiedadId: p.id };
      await this.guardar(p, v);
      return { destino: 'propiedad', propiedadId: p.id, aplicada: r.aplicada };
    }
    const fuente = uno('fuente', FUENTES_DE_SENAL, e.fuente);
    const sugerido = vacio(e.estadoSugerido) ? undefined : uno('estadoSugerido', ESTADOS, e.estadoSugerido);
    const recibidaEn = vacio(e.recibidaEn) ? this.c.reloj.ahora() : new Date(String(e.recibidaEn));
    if (Number.isNaN(recibidaEn.getTime())) throw new DatoInvalido('recibidaEn', 'Fecha inválida');
    const contacto = e.contacto
      ? Object.fromEntries(
          (['nombre', 'telefono', 'correo'] as const)
            .map((k) => [k, textoOpcional(`contacto.${k}`, e.contacto?.[k], 200)])
            .filter(([, x]) => x),
        )
      : undefined;
    const pendiente = await this.c.bandeja.agregar(
      {
        fuente,
        resumen: texto('resumen', e.resumen, 2000),
        confianza: vacio(e.confianza) ? 1 : numero('confianza', e.confianza, 0, 1),
        recibidaEn: recibidaEn.toISOString(),
        ...opc('estadoSugerido', sugerido),
        ...opc('canalId', textoOpcional('canalId', e.canalId, 60)),
        ...opc('referenciaExterna', textoOpcional('referenciaExterna', e.referenciaExterna, 500)),
        ...opc('remitente', textoOpcional('remitente', e.remitente, 300)),
        ...opc('asunto', textoOpcional('asunto', e.asunto, 500)),
        ...opc('urlDetectada', url),
        ...opc('direccionDetectada', textoOpcional('direccion', e.direccion, 300)),
        ...opc('comunaDetectada', textoOpcional('comuna', e.comuna, 100)),
        ...(contacto && Object.keys(contacto).length ? { contactoDetectado: contacto } : {}),
      },
      this.c.ids.nuevo(),
      this.c.reloj.ahora(),
    );
    return pendiente ? { destino: 'bandeja', senalId: pendiente.id } : { destino: 'repetida' };
  }

  async listarBandeja(): Promise<SenalPendiente[]> {
    return this.c.bandeja.pendientes();
  }

  /** Lleva una señal de la Bandeja a una propiedad (y la aplica si es segura). */
  async asociarSenal(senalId: string, propiedadId: string): Promise<VistaPropiedadDetalle> {
    const s = await this.c.bandeja.porId(senalId);
    if (!s || s.estado !== 'pendiente') throw new NoEncontrado('La señal pendiente');
    const { p, v } = await this.conVersion(propiedadId, undefined);
    p.registrarSenal(
      { ...s, referenciaExterna: s.referenciaExterna },
      await this.c.ajustes.umbral(),
      deps(this.c),
    );
    if (s.contactoDetectado?.nombre)
      p.registrarContacto(
        { ...s.contactoDetectado, nombre: s.contactoDetectado.nombre, canalId: s.canalId },
        deps(this.c),
      );
    if (s.urlDetectada)
      p.agregarPublicacion(
        {
          canalId: s.canalId ?? (await this.canalDeUrl(s.urlDetectada)) ?? (await this.canalOtro()),
          url: s.urlDetectada,
        },
        deps(this.c),
      );
    await this.guardar(p, v);
    await this.c.bandeja.resolver(senalId, 'asociada', propiedadId, this.c.reloj.ahora());
    return this.ver(propiedadId);
  }

  async descartarSenal(senalId: string): Promise<void> {
    const s = await this.c.bandeja.porId(senalId);
    if (!s || s.estado !== 'pendiente') throw new NoEncontrado('La señal pendiente');
    await this.c.bandeja.resolver(senalId, 'descartada', null, this.c.reloj.ahora());
  }

  // ── Canales ──

  async listarCanales(): Promise<DatosCanal[]> {
    return (await this.c.canales.todos()).map((c) => c.datos());
  }

  /** Crea un canal, o lo edita si ya existe con ese id (la IA puede repetir sin miedo). */
  async registrarCanal(e: {
    id?: unknown;
    nombre: unknown;
    tipo?: unknown;
    dominios?: unknown;
  }): Promise<DatosCanal> {
    const nuevo = Canal.crear(e, deps(this.c));
    const existente = await this.c.canales.porId(nuevo.id);
    if (existente) {
      existente.editar({
        nombre: e.nombre,
        ...(e.tipo !== undefined ? { tipo: e.tipo } : {}),
        ...(e.dominios !== undefined ? { dominios: e.dominios } : {}),
        activo: true,
      });
      await this.c.canales.guardar(existente);
      return existente.datos();
    }
    await this.c.canales.guardar(nuevo);
    return nuevo.datos();
  }

  async editarCanal(
    id: string,
    e: { nombre?: unknown; tipo?: unknown; dominios?: unknown; activo?: unknown },
  ): Promise<DatosCanal> {
    const c = await this.c.canales.porId(id);
    if (!c) throw new NoEncontrado('El canal');
    c.editar(e);
    await this.c.canales.guardar(c);
    return c.datos();
  }

  // ── Búsqueda ──

  async verBusqueda(): Promise<{
    reglas: (DatosBusqueda['reglas'][number] & { descripcion: string })[];
    persona: DatosBusqueda['persona'];
    historial: ConFechasEnTexto<DatosBusqueda['historial'][number]>[];
    criteriosSugeridos: Criterio[];
    uf: { valor: number; fecha: Fecha } | null;
    actualizadaEn: string | null;
  }> {
    const [b, uf] = await Promise.all([this.c.busqueda.leer(), this.c.ajustes.uf()]);
    const d = b.datos();
    const usados = new Set(d.reglas.map((r) => r.criterio));
    return {
      reglas: d.reglas.map((r) => ({ ...r, descripcion: describir(r) })),
      persona: d.persona,
      historial: enTexto(d.historial).reverse().slice(0, 30),
      criteriosSugeridos: CRITERIOS_SUGERIDOS.filter((c) => !usados.has(c)),
      uf,
      actualizadaEn: d.actualizadaEn?.toISOString() ?? null,
    };
  }

  async cambiarBusqueda(
    e: { reglas?: unknown; persona?: Record<string, unknown> | null; motivo: unknown },
    origen: Origen,
  ): ReturnType<CasosDeArriendos['verBusqueda']> {
    const b = await this.c.busqueda.leer();
    b.cambiar(e, origen, deps(this.c));
    await this.c.busqueda.guardar(b);
    return this.verBusqueda();
  }

  async fijarUf(valor: unknown, fecha: unknown): Promise<void> {
    await this.c.ajustes.fijarUf(numero('valor', valor, 1000, 1_000_000), fechaValida('fecha', fecha));
  }

  // ── Mapa ──

  async mapa(): Promise<{ ubicadas: VistaPropiedad[]; sinUbicar: VistaPropiedad[] }> {
    const { items } = await this.listar({ abiertas: true });
    return { ubicadas: items.filter((v) => v.ubicacion), sinUbicar: items.filter((v) => !v.ubicacion) };
  }
}

function opc<K extends string, V>(k: K, v: V | undefined): { [P in K]?: V } {
  return (v === undefined ? {} : { [k]: v }) as { [P in K]?: V };
}
