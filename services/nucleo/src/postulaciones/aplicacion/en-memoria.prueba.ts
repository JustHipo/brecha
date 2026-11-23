// Dobles en memoria de los puertos de salida, para probar los casos de uso sin base.
import type { Prioridad } from '../../compartido/dominio/evento-de-dominio';
import { depsDePrueba } from '../../compartido/dominio/pruebas.prueba';
import { ConflictoDeVersion, PostulacionDuplicada, SenalDuplicada } from '../dominio/errores';
import { esTerminal } from '../dominio/estado';
import { Postulacion, type PostulacionDatos } from '../dominio/postulacion';
import type { PostulacionRepositorio } from '../dominio/postulacion.repositorio';
import type { Contexto } from './base';
import { SenalPendiente, type BandejaRepositorio, type DatosPendiente } from '../dominio/senal-pendiente';
import type { Ajustes, ConsultasDePostulaciones } from './puertos';
import { aDetalle, aResumen, ordenarTarjetas, type VistaExportacion } from './vistas';
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
      for (const s of d.senales.filter((x) => pend.nuevos.has(x.id) && x.referenciaExterna)) {
        if (otra.senales.some((o) => o.referenciaExterna === s.referenciaExterna))
          throw new SenalDuplicada(s.referenciaExterna!);
      }
    }
    const version = pend.creada ? d.version : d.version + 1;
    this.filas.set(d.id, { ...d, version });
    this.outbox.push(...p.sacarEventos().map((e) => e.tipo));
    p.marcarGuardada(version);
  }
}

export class ConsultasEnMemoria implements ConsultasDePostulaciones {
  constructor(
    private readonly repo: RepositorioEnMemoria,
    private readonly reloj: Reloj,
  ) {}
  private todas() {
    return [...this.repo.filas.values()];
  }
  async listar(f: Parameters<ConsultasDePostulaciones['listar']>[0], p: { limit: number; offset: number }) {
    const items = this.todas()
      .map((d) => aResumen(d, this.reloj))
      .filter((r) => !f.estados || f.estados.includes(r.estado))
      .filter((r) => !f.plataformas || f.plataformas.includes(r.plataforma))
      .filter((r) => !f.prioridades || f.prioridades.includes(r.prioridad))
      .filter((r) => !f.q || `${r.titulo} ${r.empresa}`.toLowerCase().includes(f.q.toLowerCase()))
      .sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn) || a.id.localeCompare(b.id));
    return { items: items.slice(p.offset, p.offset + p.limit), total: items.length };
  }
  async tablero() {
    const resumenes = this.todas().map((d) => aResumen(d, this.reloj));
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
    return d ? aDetalle(d, this.reloj) : null;
  }
  async resumenDesde() {
    return [];
  }
  async exportar(): Promise<VistaExportacion> {
    const postulaciones = this.todas().map((d) => aDetalle(d, this.reloj));
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
  const c: Contexto = { repo, bandeja, consultas: new ConsultasEnMemoria(repo, reloj), reloj, ids, ajustes };
  return { c, repo, reloj, ajustes, bandeja };
}
