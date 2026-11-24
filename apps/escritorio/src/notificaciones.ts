import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUERTOS } from './rutas';

export interface Aviso {
  titulo: string;
  cuerpo: string;
  ruta: string; // ruta de la consola a abrir al hacer clic
}

export interface Evento {
  tipo: string;
  datos: {
    postulacionId?: string;
    de?: string;
    a?: string;
    origen?: string;
    resumen?: string;
    aplicada?: boolean;
    /** Pasos pendientes (docs/diseno/pasos.md): un paso puede tocar varias postulaciones. */
    postulacionIds?: string[];
    descripcion?: string;
  };
}

/** La postulación del evento (los pasos traen varias: se nombra la primera). */
export function postulacionDe(e: Evento): string | undefined {
  return e.datos.postulacionId ?? e.datos.postulacionIds?.[0];
}

const ESTADOS: Record<string, string> = {
  postulado: 'postulada',
  en_proceso: 'en proceso',
  entrevista: 'en entrevista',
  oferta: 'con oferta',
  rechazado: 'rechazada',
  aceptada: 'aceptada',
  descartado: 'descartada',
};

/** Qué merece un aviso del sistema (prioridad alta, PLAN F3): lo que cambió solo y lo que no calza. */
export function avisoDe(e: Evento, nombre: string): Aviso | null {
  const id = postulacionDe(e);
  const ruta = id ? `/postulaciones/${id}` : '/tablero';
  if (e.tipo === 'paso.detectado' && e.datos.descripcion) {
    // Un pedido siempre avisa, también en una postulación cerrada (R18).
    const otras = (e.datos.postulacionIds?.length ?? 1) - 1;
    return {
      titulo: `Te piden algo: ${nombre}${otras > 0 ? ` y ${otras} más` : ''}`,
      cuerpo: e.datos.descripcion,
      ruta,
    };
  }
  if (e.tipo === 'postulacion.estado_cambiado' && e.datos.origen === 'senal') {
    return {
      titulo: `${nombre}: ${ESTADOS[e.datos.a ?? ''] ?? e.datos.a}`,
      cuerpo: 'Lo movió un correo que llegó.',
      ruta,
    };
  }
  if (e.tipo === 'postulacion.discrepancia_detectada') {
    return { titulo: `Revisa ${nombre}`, cuerpo: 'Un movimiento no calza con la evidencia.', ruta };
  }
  if (e.tipo === 'postulacion.entrevista_agendada') {
    return { titulo: `Entrevista: ${nombre}`, cuerpo: 'Quedó agendada.', ruta };
  }
  if (e.tipo === 'postulacion.senal_registrada' && e.datos.aplicada === false && e.datos.resumen) {
    return { titulo: `Novedad en ${nombre}`, cuerpo: e.datos.resumen, ruta };
  }
  return null;
}

/** Lee el SSE del núcleo con el token de la consola y avisa. Se reconecta solo. */
export class OyenteDeEventos {
  private detenido = false;
  private control: AbortController | null = null;

  constructor(
    private readonly instancia: string,
    private readonly avisar: (a: Aviso) => void,
    private readonly alEvento: (e: Evento) => void,
  ) {}

  private token(): string | null {
    const ruta = join(this.instancia, 'token-consola');
    return existsSync(ruta) ? readFileSync(ruta, 'utf8').trim() : null;
  }

  iniciar(): void {
    this.detenido = false;
    void this.bucle();
  }

  detener(): void {
    this.detenido = true;
    this.control?.abort();
  }

  private async nombre(id: string | undefined, token: string): Promise<string> {
    if (!id) return 'Brecha';
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTOS.nucleo}/api/v1/postulaciones/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = (await r.json()) as { empresa?: string; titulo?: string };
      return d.empresa ? `${d.empresa} · ${d.titulo}` : 'Tu postulación';
    } catch {
      return 'Tu postulación';
    }
  }

  private async bucle(): Promise<void> {
    while (!this.detenido) {
      const token = this.token();
      try {
        if (!token) throw new Error('sin token');
        this.control = new AbortController();
        const r = await fetch(`http://127.0.0.1:${PUERTOS.nucleo}/api/v1/eventos/stream`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: this.control.signal,
        });
        if (!r.ok || !r.body) throw new Error(`SSE ${r.status}`);
        const lector = r.body.getReader();
        const decodificador = new TextDecoder();
        let resto = '';
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          resto += decodificador.decode(value, { stream: true });
          const bloques = resto.split('\n\n');
          resto = bloques.pop() ?? '';
          for (const b of bloques) {
            const datos = b
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trim())
              .join('');
            if (!datos) continue;
            const e = JSON.parse(datos) as Evento;
            if (!e.tipo || e.tipo === 'latido') continue;
            this.alEvento(e);
            const nombre = await this.nombre(e.datos ? postulacionDe(e) : undefined, token);
            const aviso = avisoDe(e, nombre);
            if (aviso) this.avisar(aviso);
          }
        }
      } catch {
        // núcleo reiniciándose o sin token todavía: se reintenta
      }
      if (!this.detenido) await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}
