import type { PrismaClient } from '../../../generado/prisma/client';
import {
  PerfilEmpleo,
  perfilVacio,
  type DatosPerfilEmpleo,
  type PerfilEmpleoRepositorio,
} from '../../dominio/perfil-empleo';

/** El perfil de Empleo en una sola fila (id = 1), como la búsqueda de Arriendos (perfil.md §3.3). */
export class PrismaPerfilEmpleo implements PerfilEmpleoRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async leer(): Promise<PerfilEmpleo> {
    const f = await this.prisma.perfilEmpleo.findUnique({ where: { id: 1 } });
    if (!f) return PerfilEmpleo.reconstituir(perfilVacio());
    const d = f.datos as unknown as Omit<DatosPerfilEmpleo, 'actualizadaEn'>;
    return PerfilEmpleo.reconstituir({
      reglas: d.reglas ?? [],
      datos: d.datos ?? {},
      historial: (d.historial ?? []).map((h) => ({ ...h, ocurridoEn: new Date(h.ocurridoEn) })),
      actualizadaEn: f.actualizadaEn,
    });
  }

  async guardar(p: PerfilEmpleo): Promise<void> {
    const { actualizadaEn, ...resto } = p.datos();
    const datos = JSON.parse(JSON.stringify(resto)) as object;
    const cuando = actualizadaEn ?? new Date();
    await this.prisma.perfilEmpleo.upsert({
      where: { id: 1 },
      create: { id: 1, datos, actualizadaEn: cuando },
      update: { datos, actualizadaEn: cuando },
    });
  }
}
