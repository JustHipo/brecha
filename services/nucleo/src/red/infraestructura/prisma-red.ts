import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../compartido/infraestructura/prisma';
import type { OyenteDeEventos } from '../../postulaciones/infraestructura/outbox/outbox';
import {
  ContactoDeRed,
  type DatosContactoRed,
  type EstadoDeConexion,
  type Interaccion,
  type RedRepositorio,
} from '../dominio/contacto-de-red';

type Fila = NonNullable<Awaited<ReturnType<PrismaClient['contactoRed']['findUnique']>>>;
type InteraccionGuardada = Omit<Interaccion, 'ocurridaEn'> & { ocurridaEn: string };

function aDatos(f: Fila): DatosContactoRed {
  const interacciones = (f.interacciones as unknown as InteraccionGuardada[]).map((i) => ({
    ...i,
    ocurridaEn: new Date(i.ocurridaEn),
  }));
  return {
    id: f.id,
    nombre: f.nombre,
    perfilUrl: f.perfilUrl,
    ...(f.titular ? { titular: f.titular } : {}),
    ...(f.empresa ? { empresa: f.empresa } : {}),
    conexion: f.conexion as EstadoDeConexion,
    interacciones,
    postulacionIds: f.postulacionIds,
    ...(f.seguimiento ? { seguimiento: f.seguimiento } : {}),
    ...(f.notas ? { notas: f.notas } : {}),
    creadoEn: f.creadoEn,
    actualizadoEn: f.actualizadoEn,
  };
}

/** Adaptador de salida de la red. Las interacciones van en JSON: son pocas por persona y siempre se leen juntas. */
export class PrismaRed implements RedRepositorio {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly oyente?: OyenteDeEventos,
  ) {}

  async porId(id: string): Promise<ContactoDeRed | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const f = await this.prisma.contactoRed.findUnique({ where: { id } });
    return f ? ContactoDeRed.reconstituir(aDatos(f)) : null;
  }

  async porPerfil(perfilUrl: string): Promise<ContactoDeRed | null> {
    const f = await this.prisma.contactoRed.findUnique({ where: { perfilUrl } });
    return f ? ContactoDeRed.reconstituir(aDatos(f)) : null;
  }

  async todos(): Promise<ContactoDeRed[]> {
    const filas = await this.prisma.contactoRed.findMany({ orderBy: { actualizadoEn: 'desc' } });
    return filas.map((f) => ContactoDeRed.reconstituir(aDatos(f)));
  }

  async guardar(c: ContactoDeRed): Promise<void> {
    const d = c.datos();
    const datos = {
      nombre: d.nombre,
      perfilUrl: d.perfilUrl,
      titular: d.titular ?? null,
      empresa: d.empresa ?? null,
      conexion: d.conexion,
      interacciones: d.interacciones.map((i) => ({ ...i, ocurridaEn: i.ocurridaEn.toISOString() })),
      postulacionIds: d.postulacionIds,
      seguimiento: d.seguimiento ?? null,
      notas: d.notas ?? null,
      actualizadoEn: d.actualizadoEn,
    };
    await this.prisma.contactoRed.upsert({
      where: { id: d.id },
      create: { id: d.id, creadoEn: d.creadoEn, ...datos },
      update: datos,
    });
    // Aviso en vivo para la consola y la app (no va al outbox: no es un hecho de una postulación).
    this.oyente?.publicar([
      {
        id: randomUUID(),
        tipo: 'red.contacto_actualizado',
        version: 1,
        ocurridoEn: new Date().toISOString(),
        prioridad: c.pendiente() === 'responder' ? 'media' : 'baja',
        correlacionId: null,
        datos: { contactoId: d.id, nombre: d.nombre, pendiente: c.pendiente() },
      },
    ]);
  }
}
