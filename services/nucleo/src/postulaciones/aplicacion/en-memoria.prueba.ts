// Dobles en memoria de los puertos de salida, para probar los casos de uso sin base.
import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { ConflictoDeVersion, DatoInvalido, PostulacionDuplicada, SenalDuplicada } from '../dominio/errores';
import { Paso, type DatosPaso, type EstadoDePaso, type PasoRepositorio } from '../dominio/paso';
import { idDeAviso } from '../dominio/id-de-aviso';
import { esTerminal } from '../dominio/estado';
import { Postulacion, type PostulacionDatos } from '../dominio/postulacion';
import type { PostulacionRepositorio } from '../dominio/postulacion.repositorio';
import type { Contexto } from './base';
import { SenalPendiente, type BandejaRepositorio, type DatosPendiente } from '../dominio/senal-pendiente';
import type { Ajustes, ConsultasDePostulaciones } from './puertos';
import {
  aDetalle,
  aResumen,
  aVistaPaso,
  ordenarPendientes,
  ordenarTarjetas,
  type VistaExportacion,
} from './vistas';
import type { Reloj } from '../../compartido/dominio/puertos';

export class RepositorioEnMemoria implements PostulacionRepositorio {
  readonly filas = new Map<string, PostulacionDatos>();
  readonly outbox: string[] = [];

  async porId(id: string) {
    const d = this.filas.get(id);
    return d ? Postulacion.reconstituir(structuredClone(d)) : null;
  }

  async idPorUrl(url: string) {
    return [...this.filas.values()].find((d) => d.aviso.url === url)?.id ?? null;
  }

  async guardar(p: Postulacion) {
    const d = p.datos();
    const pend = p.cambiosPendientes();
    const actual = this.filas.get(d.id);
    if (!pend.creada && actual?.version !== d.version) throw new ConflictoDeVersion();
    for (const otra of this.filas.values()) {
      if (
        otra.id !== d.id &&
        !esTerminal(otra.estado) &&
        !esTerminal(d.estado) &&
        otra.aviso.url === d.aviso.url
      ) {
        throw new PostulacionDuplicada(d.aviso.url, otra.id);
      }
    }
    const version = pend.creada ? d.version : d.version + 1;
    this.filas.set(d.id, { ...d, version });
    this.outbox.push(...p.sacarEventos().map((e) => e.tipo));
    p.marcarGuardada(version);
  }
}

export class PasosEnMemoria implements PasoRepositorio {
  readonly filas = new Map<string, DatosPaso>();
  readonly outbox: string[] = [];
  constructor(private readonly repo: RepositorioEnMemoria) {}
  async porId(id: string) {
    const d = this.filas.get(id);
    return d ? Paso.reconstituir(d) : null;
  }
  async porReferencia(ref: string) {
    const d = [...this.filas.values()].find((x) => x.referenciaExterna === ref);
    return d ? Paso.reconstituir(d) : null;
  }
  async deLasPostulaciones(ids: readonly string[]) {
    return [...this.filas.values()]
      .filter((x) => x.postulacionIds.some((p) => ids.includes(p)))
      .sort((a, b) => a.pedidoEn.getTime() - b.pedidoEn.getTime())
      .map((x) => Paso.reconstituir(x));
  }
  async estadosDePostulaciones(ids: readonly string[]) {
    return new Map(
      ids.flatMap((id) => {
        const p = this.repo.filas.get(id);
        return p ? [[id, p.estado] as [string, string]] : [];
      }),
    );
  }
  async guardar(paso: Paso) {
    const d = paso.datos();
    const actual = this.filas.get(d.id);
    if (!paso.creado && actual?.version !== d.version) throw new ConflictoDeVersion();
    if (
      d.referenciaExterna &&
      [...this.filas.values()].some((x) => x.id !== d.id && x.referenciaExterna === d.referenciaExterna)
    )
      throw new DatoInvalido('referenciaExterna', 'Ya hay un paso de ese correo o mensaje');
    const version = paso.creado ? 0 : d.version + 1;
    this.filas.set(d.id, { ...d, version });
    this.outbox.push(...paso.sacarEventos().map((e) => e.tipo));
    paso.marcarGuardado(version);
  }
  de(postulacionId: string): DatosPaso[] {
    return [...this.filas.values()].filter((x) => x.postulacionIds.includes(postulacionId));
  }
}

export class ConsultasEnMemoria implements ConsultasDePostulaciones {
  constructor(
    private readonly repo: RepositorioEnMemoria,
    private readonly reloj: Reloj,
    private readonly pasosEnMemoria: PasosEnMemoria = new PasosEnMemoria(repo),
  ) {}
  private todas() {
    return [...this.repo.filas.values()];
  }
  private info() {
    return new Map(
      this.todas().map((d) => [d.id, { empresa: d.aviso.empresa, titulo: d.aviso.titulo, estado: d.estado }]),
    );
  }
  async pasos(f: { estado?: EstadoDePaso; postulacionId?: string } = {}) {
    return [...this.pasosEnMemoria.filas.values()]
      .filter((x) => !f.estado || x.estado === f.estado)
      .filter((x) => !f.postulacionId || x.postulacionIds.includes(f.postulacionId))
      .sort(
        (a, b) =>
          Number(a.estado !== 'pendiente') - Number(b.estado !== 'pendiente') ||
          (a.estado === 'pendiente' ? ordenarPendientes(a, b) : b.pedidoEn.getTime() - a.pedidoEn.getTime()),
      )
      .map((x) => aVistaPaso(x, this.info(), this.reloj));
  }
  async paso(id: string) {
    const x = this.pasosEnMemoria.filas.get(id);
    return x ? aVistaPaso(x, this.info(), this.reloj) : null;
  }
  async listar(f: Parameters<ConsultasDePostulaciones['listar']>[0], p: { limit: number; offset: number }) {
    const items = this.todas()
      .filter((d) => !f.url || d.aviso.url === f.url || idDeAviso(d.aviso.url) === idDeAviso(f.url))
      .map((d) => aResumen(d, this.reloj, this.pasosEnMemoria.de(d.id)))
      .filter((r) => !f.estados || f.estados.includes(r.estado))
      .filter((r) => !f.plataformas || f.plataformas.includes(r.plataforma))
      .filter((r) => !f.prioridades || f.prioridades.includes(r.prioridad))
      .filter((r) => !f.etiquetas || f.etiquetas.every((e) => r.etiquetas.includes(e)))
      .filter((r) => !f.q || `${r.titulo} ${r.empresa}`.toLowerCase().includes(f.q.toLowerCase()))
      .sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn) || a.id.localeCompare(b.id));
    return { items: items.slice(p.offset, p.offset + p.limit), total: items.length };
  }
  async etiquetasEnUso() {
    const conteo = new Map<string, number>();
    for (const d of this.todas()) for (const e of d.etiquetas) conteo.set(e, (conteo.get(e) ?? 0) + 1);
    return [...conteo]
      .map(([etiqueta, total]) => ({ etiqueta, total }))
      .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta));
  }
  async tablero(f: { etiquetas?: string[] } = {}) {
    const resumenes = this.todas()
      .map((d) => aResumen(d, this.reloj, this.pasosEnMemoria.de(d.id)))
      .filter((r) => !f.etiquetas || f.etiquetas.every((e) => r.etiquetas.includes(e)));
    const estados = [
      'sin_decidir',
      'por_postular',
      'postulado',
      'en_proceso',
      'entrevista',
      'oferta',
      'aceptada',
      'rechazado',
      'descartado',
    ] as const;
    return {
      columnas: estados.map((estado) => {
        const items = resumenes.filter((r) => r.estado === estado).sort(ordenarTarjetas);
        return { estado, total: items.length, items };
      }),
    };
  }
  async detalle(id: string) {
    const d = this.repo.filas.get(id);
    return d ? aDetalle(d, this.reloj, this.pasosEnMemoria.de(d.id), this.info()) : null;
  }
  async resumenDesde() {
    return [];
  }
  async exportar(): Promise<VistaExportacion> {
    const postulaciones = this.todas().map((d) =>
      aDetalle(d, this.reloj, this.pasosEnMemoria.de(d.id), this.info()),
    );
    const porPrioridad: Record<Prioridad, number> = { alta: 0, media: 0, baja: 0 };
    const porEstado: Record<string, number> = {};
    for (const p of postulaciones) {
      porPrioridad[p.prioridad] += 1;
      porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1;
    }
    return {
      generadoEn: this.reloj.ahora().toISOString(),
      conteos: { porEstado, porPrioridad },
      postulaciones,
    };
  }
}

export class BandejaEnMemoria implements BandejaRepositorio {
  readonly filas = new Map<string, DatosPendiente>();
  readonly eventos: string[] = [];
  constructor(private readonly repo: RepositorioEnMemoria) {}
  async porId(id: string) {
    const d = this.filas.get(id);
    return d ? SenalPendiente.reconstituir(structuredClone(d)) : null;
  }
  async guardar(s: SenalPendiente, evento?: { tipo: string }) {
    const d = s.datos();
    for (const o of this.filas.values()) {
      if (o.id !== d.id && d.referenciaExterna && o.referenciaExterna === d.referenciaExterna)
        throw new SenalDuplicada(d.referenciaExterna);
    }
    this.filas.set(d.id, d);
    if (evento) this.eventos.push(evento.tipo);
  }
  async referenciaEnBandeja(ref: string) {
    return [...this.filas.values()].some((x) => x.referenciaExterna === ref);
  }
  async referenciaUsada(ref: string) {
    return (
      [...this.filas.values()].some((x) => x.referenciaExterna === ref) ||
      [...this.repo.filas.values()].some((p) => p.senales.some((x) => x.referenciaExterna === ref))
    );
  }
  async pendientes() {
    return [...this.filas.values()]
      .filter((x) => x.estado === 'pendiente')
      .sort((a, b) => b.recibidaEn.getTime() - a.recibidaEn.getTime());
  }
}

export class AjustesFijos implements Ajustes {
  constructor(
    public seguras = false,
    public umbral = 0.9,
  ) {}
  async aplicarSenalesSeguras() {
    return this.seguras;
  }
  async umbralConfianza() {
    return this.umbral;
  }
}

export function contextoDePrueba(fecha?: Date) {
  const { reloj, ids } = depsDePrueba(fecha ?? new Date('2026-11-23T12:00:00Z'));
  const repo = new RepositorioEnMemoria();
  const ajustes = new AjustesFijos();
  const bandeja = new BandejaEnMemoria(repo);
  const pasos = new PasosEnMemoria(repo);
  const c: Contexto = {
    repo,
    bandeja,
    pasos,
    consultas: new ConsultasEnMemoria(repo, reloj, pasos),
    reloj,
    ids,
    ajustes,
  };
  return { c, repo, reloj, ajustes, bandeja, pasos };
}
