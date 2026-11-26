import type { PrismaClient } from '../../compartido/infraestructura/prisma';
import type { Geocodificador } from '../aplicacion/puertos';

/**
 * Dirección → punto con Nominatim, el buscador de OpenStreetMap (docs/diseno/arriendos.md §6, A-D17).
 * Política de uso (operations.osmfoundation.org/policies/nominatim, revisada el 24-nov-2026): máximo un pedido por
 * segundo, identificarse con un User-Agent propio y guardar los resultados. Por eso: una cola que espera entre
 * pedidos, caché en la tabla `geocodificacion` (también de lo que no encontró) y nada de autocompletar.
 * Solo sale la dirección del aviso; nunca datos de la persona.
 */
export const AGENTE = 'Brecha/1.0 (app personal local de seguimiento de arriendos)';
const ESPERA_MS = 1100;

type Buscar = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

export function consultaDe(direccion: string, comuna?: string): string {
  return [direccion, comuna, 'Chile'].filter(Boolean).join(', ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export class GeocodificadorNominatim implements Geocodificador {
  private cola: Promise<unknown> = Promise.resolve();
  private ultimo = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly activo: () => Promise<boolean>,
    private readonly buscar: Buscar = (u, i) => fetch(u, i),
    private readonly base = 'https://nominatim.openstreetmap.org',
    private readonly esperar = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async ubicar(direccion: string, comuna?: string): Promise<{ lat: number; lon: number } | null> {
    if (!(await this.activo())) return null;
    const consulta = consultaDe(direccion, comuna);
    const guardada = await this.prisma.geocodificacion.findUnique({ where: { consulta } });
    if (guardada)
      return guardada.lat !== null && guardada.lon !== null ? { lat: guardada.lat, lon: guardada.lon } : null;
    const turno = this.cola.then(() => this.pedir(consulta));
    this.cola = turno.catch(() => undefined);
    return turno;
  }

  private async pedir(consulta: string): Promise<{ lat: number; lon: number } | null> {
    // Otro pedido pudo guardar esta misma consulta mientras esperaba su turno.
    const ya = await this.prisma.geocodificacion.findUnique({ where: { consulta } });
    if (ya) return ya.lat !== null && ya.lon !== null ? { lat: ya.lat, lon: ya.lon } : null;
    const falta = this.ultimo + ESPERA_MS - Date.now();
    if (falta > 0) await this.esperar(falta);
    this.ultimo = Date.now();
    const url = `${this.base}/search?${new URLSearchParams({
      q: consulta,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'cl',
    })}`;
    let punto: { lat: number; lon: number } | null = null;
    try {
      const r = await this.buscar(url, { headers: { 'User-Agent': AGENTE, 'Accept-Language': 'es' } });
      if (!r.ok) return null; // sin guardar: se intenta otro día
      const datos = (await r.json()) as { lat?: string; lon?: string }[];
      const p = datos[0];
      if (p?.lat && p.lon) punto = { lat: Number(p.lat), lon: Number(p.lon) };
    } catch {
      return null; // sin internet: no se guarda nada
    }
    await this.prisma.geocodificacion.upsert({
      where: { consulta },
      create: { consulta, lat: punto?.lat ?? null, lon: punto?.lon ?? null, creadaEn: new Date() },
      update: {},
    });
    return punto;
  }
}
