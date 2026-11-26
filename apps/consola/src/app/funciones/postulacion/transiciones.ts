import { Injectable, inject } from '@angular/core';
import type { EstadoPostulacion, Transicion } from '@brecha/contratos';
import { DialogoCerrar } from './dialogos/cerrar';
import { Dialogos } from './dialogos/dialogos.service';
import { DialogoMover } from './dialogos/mover';
import { DialogoPostular, type DatosPostular } from './dialogos/postular';

export interface Sujeto {
  empresa: string;
  titulo: string;
  plataforma: string;
  estado: EstadoPostulacion;
  fechaPostulacion: string | null;
  transicionesPosibles: EstadoPostulacion[];
  /** Lo que te piden: al cerrarla se ofrece descartarlo (pasos.md R17). */
  pasosPendientes?: { descripcion: string }[];
}

export type DatosExtra = Omit<Transicion, 'a' | 'version' | 'origen'>;

/** Decide qué pide cada destino antes de llamar a la API (R2 y R5, ui.md §4.2 paso 2). */
@Injectable({ providedIn: 'root' })
export class Transiciones {
  private readonly dialogos = inject(Dialogos);

  /** Devuelve los datos extra, `{}` si no hace falta nada, o `null` si la persona canceló. */
  async datosPara(p: Sujeto, a: EstadoPostulacion): Promise<DatosExtra | null> {
    const ctx = { empresa: p.empresa, titulo: p.titulo };
    if (a === 'postulado' && !p.fechaPostulacion) {
      const r = await this.dialogos.abrir<DatosPostular, object>(DialogoPostular, {
        ...ctx,
        plataforma: p.plataforma,
      });
      return r ?? null;
    }
    if (a === 'rechazado' || a === 'descartado') {
      const pasos = (p.pasosPendientes ?? []).map((x) => x.descripcion);
      const r = await this.dialogos.abrir<{ motivo: string; descartarPasos?: boolean }, object>(
        DialogoCerrar,
        { ...ctx, a, pasos },
      );
      return r ?? null;
    }
    return {};
  }

  elegirDestino(p: Sujeto, tituloClave?: string): Promise<EstadoPostulacion | undefined> {
    return this.dialogos.abrir<EstadoPostulacion, object>(DialogoMover, {
      empresa: p.empresa,
      titulo: p.titulo,
      estado: p.estado,
      destinos: p.transicionesPosibles,
      ...(tituloClave ? { tituloClave } : {}),
    });
  }
}
