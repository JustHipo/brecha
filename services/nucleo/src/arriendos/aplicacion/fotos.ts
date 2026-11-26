import { ErrorDeDominio } from '../../compartido/dominio/error-de-dominio';
import type { GeneradorId, Reloj } from '../../compartido/dominio/puertos';
import {
  conPortada,
  EXTENSION,
  fuenteDeFoto,
  revisarCupo,
  revisarLlamada,
  sinHuecos,
  validarImagen,
} from '../dominio/foto';
import { DatoInvalido, NoEncontrado } from '../dominio/valores';
import type { AlmacenDeFotos, Foto, FotoRepositorio, ObtenedorDeImagenes } from './puertos';

/** Fotos de las propiedades (docs/diseno/fotos-propiedades.md). */
export interface ContextoDeFotos {
  fotos: FotoRepositorio;
  almacen: AlmacenDeFotos;
  obtener: ObtenedorDeImagenes;
  existePropiedad(id: string): Promise<boolean>;
  /** Aviso en vivo para que la consola recargue (propiedad.actualizada). */
  avisar?(propiedadId: string): void;
  reloj: Reloj;
  ids: GeneradorId;
}

export interface VistaFoto {
  id: string;
  orden: number;
  portada: boolean;
  tipo: string;
  bytes: number;
  origen: 'url' | 'archivo';
  urlOrigen: string | null;
  nombreOrigen: string | null;
  creadaEn: string;
}

export type EstadoDeFotoAgregada = 'agregada' | 'ya_estaba' | 'error';

export interface ResultadoDeFoto {
  fuente: string;
  estado: EstadoDeFotoAgregada;
  foto?: VistaFoto;
  codigo?: string;
  mensaje?: string;
}

export interface FotosAgregadas {
  resultados: ResultadoDeFoto[];
  fotos: VistaFoto[];
}

export function vistaFoto(f: Foto): VistaFoto {
  return {
    id: f.id,
    orden: f.orden,
    portada: f.orden === 0,
    tipo: f.tipo,
    bytes: f.bytes,
    origen: f.origen,
    urlOrigen: f.urlOrigen,
    nombreOrigen: f.nombreOrigen,
    creadaEn: f.creadaEn.toISOString(),
  };
}

/** Lo que se cuenta de un error al agregar una foto: nunca el detalle interno. */
function comoError(e: unknown): { codigo: string; mensaje: string } {
  if (e instanceof ErrorDeDominio) return { codigo: e.codigo, mensaje: e.message };
  return { codigo: 'ERROR_INTERNO', mensaje: 'No se pudo guardar la foto' };
}

export class CasosDeFotos {
  constructor(private readonly c: ContextoDeFotos) {}

  private async revisarPropiedad(id: string): Promise<void> {
    if (!(await this.c.existePropiedad(id))) throw new NoEncontrado('La propiedad');
  }

  private async deLaPropiedad(propiedadId: string, fotoId: string): Promise<Foto> {
    const f = await this.c.fotos.porId(fotoId);
    if (!f || f.propiedadId !== propiedadId) throw new NoEncontrado('La foto');
    return f;
  }

  async listar(propiedadId: string): Promise<VistaFoto[]> {
    await this.revisarPropiedad(propiedadId);
    return (await this.c.fotos.dePropiedad(propiedadId)).map(vistaFoto);
  }

  /**
   * Agrega una lista de URL o rutas (F-D11): cada una por separado, una que falla no frena a las demás.
   * `portada`: posición (desde 0) en `fuentes` de la que va de portada.
   */
  async agregar(propiedadId: string, fuentes: unknown, portada?: unknown): Promise<FotosAgregadas> {
    if (!Array.isArray(fuentes) || fuentes.some((f) => typeof f !== 'string'))
      throw new DatoInvalido('fotos', 'Debe ser una lista de URL o rutas');
    revisarLlamada(fuentes.length);
    if (
      portada !== undefined &&
      portada !== null &&
      (!Number.isInteger(portada) || (portada as number) < 0 || (portada as number) >= fuentes.length)
    )
      throw new DatoInvalido('portada', 'Debe ser la posición de una de las fotos de la lista (desde 0)');
    await this.revisarPropiedad(propiedadId);

    const resultados: ResultadoDeFoto[] = [];
    for (const fuente of fuentes as string[]) {
      try {
        const f = fuenteDeFoto(fuente);
        const r =
          f.tipo === 'url'
            ? await this.c.obtener
                .descargar(f.url)
                .then(({ bytes }) => this.guardar(propiedadId, bytes, { origen: 'url', urlOrigen: f.url }))
            : await this.c.obtener
                .leerLocal(f.ruta)
                .then(({ bytes, nombre }) =>
                  this.guardar(propiedadId, bytes, { origen: 'archivo', nombreOrigen: nombre }),
                );
        resultados.push({ fuente, estado: r.yaEstaba ? 'ya_estaba' : 'agregada', foto: r.foto });
      } catch (e) {
        resultados.push({ fuente, estado: 'error', ...comoError(e) });
      }
    }
    const elegida = typeof portada === 'number' ? resultados[portada]?.foto : undefined;
    if (elegida) await this.ordenarConPortada(propiedadId, elegida.id);
    if (resultados.some((r) => r.estado === 'agregada') || elegida) this.c.avisar?.(propiedadId);
    const fotos = (await this.c.fotos.dePropiedad(propiedadId)).map(vistaFoto);
    const porId = new Map(fotos.map((f) => [f.id, f]));
    return {
      resultados: resultados.map((r) => (r.foto ? { ...r, foto: porId.get(r.foto.id) ?? r.foto } : r)),
      fotos,
    };
  }

  /** Un archivo que la consola sube (F-D9 desde el navegador). */
  async agregarArchivo(
    propiedadId: string,
    bytes: Uint8Array,
    nombre?: string,
  ): Promise<{ foto: VistaFoto; yaEstaba: boolean }> {
    await this.revisarPropiedad(propiedadId);
    const limpio = nombre
      ?.replace(/\p{Cc}/gu, '')
      .trim()
      .slice(0, 200);
    const r = await this.guardar(propiedadId, bytes, {
      origen: 'archivo',
      ...(limpio ? { nombreOrigen: limpio } : {}),
    });
    if (!r.yaEstaba) this.c.avisar?.(propiedadId);
    return r;
  }

  /** Revisa, deduplica por contenido (F-D10), escribe el archivo y después la fila; si la fila falla, borra el archivo. */
  private async guardar(
    propiedadId: string,
    bytes: Uint8Array,
    o: { origen: 'url' | 'archivo'; urlOrigen?: string; nombreOrigen?: string },
  ): Promise<{ foto: VistaFoto; yaEstaba: boolean }> {
    const tipo = validarImagen(bytes);
    const sha256 = this.c.almacen.huella(bytes);
    const repetida = await this.c.fotos.porHuella(propiedadId, sha256);
    if (repetida) return { foto: vistaFoto(repetida), yaEstaba: true };
    const actuales = await this.c.fotos.dePropiedad(propiedadId);
    revisarCupo(actuales.length);
    const id = this.c.ids.nuevo();
    const foto: Foto = {
      id,
      propiedadId,
      orden: actuales.length ? Math.max(...actuales.map((f) => f.orden)) + 1 : 0,
      archivo: `${id}.${EXTENSION[tipo]}`,
      tipo,
      bytes: bytes.length,
      sha256,
      origen: o.origen,
      urlOrigen: o.urlOrigen ?? null,
      nombreOrigen: o.nombreOrigen ?? null,
      creadaEn: this.c.reloj.ahora(),
    };
    await this.c.almacen.guardar(foto.archivo, bytes);
    try {
      await this.c.fotos.crear(foto);
    } catch (e) {
      await this.c.almacen.borrar(foto.archivo);
      throw e;
    }
    return { foto: vistaFoto(foto), yaEstaba: false };
  }

  private async ordenarConPortada(propiedadId: string, fotoId: string): Promise<void> {
    const fotos = await this.c.fotos.dePropiedad(propiedadId);
    const orden = conPortada(fotos, fotoId);
    await this.c.fotos.actualizar(
      fotos.filter((f) => orden.get(f.id) !== f.orden).map((f) => ({ id: f.id, orden: orden.get(f.id)! })),
    );
  }

  async elegirPortada(propiedadId: string, fotoId: string): Promise<VistaFoto[]> {
    await this.revisarPropiedad(propiedadId);
    await this.deLaPropiedad(propiedadId, fotoId);
    await this.ordenarConPortada(propiedadId, fotoId);
    this.c.avisar?.(propiedadId);
    return this.listar(propiedadId);
  }

  /** Quita una foto: la fila, el archivo, y el orden queda sin huecos (si era la portada, la siguiente pasa a serlo). */
  async quitar(propiedadId: string, fotoId: string): Promise<VistaFoto[]> {
    await this.revisarPropiedad(propiedadId);
    const f = await this.deLaPropiedad(propiedadId, fotoId);
    await this.c.fotos.borrar(f.id);
    await this.c.almacen.borrar(f.archivo);
    await this.compactar(propiedadId);
    this.c.avisar?.(propiedadId);
    return this.listar(propiedadId);
  }

  private async compactar(propiedadId: string): Promise<void> {
    const fotos = await this.c.fotos.dePropiedad(propiedadId);
    const orden = sinHuecos(fotos);
    await this.c.fotos.actualizar(
      fotos.filter((f) => orden.get(f.id) !== f.orden).map((f) => ({ id: f.id, orden: orden.get(f.id)! })),
    );
  }

  /** Los bytes y el tipo, para servirla. */
  async abrir(fotoId: string): Promise<{ tipo: string; bytes: Uint8Array }> {
    const f = await this.c.fotos.porId(fotoId);
    const bytes = f ? await this.c.almacen.leer(f.archivo) : null;
    if (!f || !bytes) throw new NoEncontrado('La foto');
    return { tipo: f.tipo, bytes };
  }

  // ── Lo que usa CasosDeArriendos ──

  /** Todas las fotos por propiedad, en orden. */
  async porPropiedad(): Promise<Map<string, VistaFoto[]>> {
    const m = new Map<string, VistaFoto[]>();
    for (const f of await this.c.fotos.todas()) {
      const lista = m.get(f.propiedadId) ?? [];
      lista.push(vistaFoto(f));
      m.set(f.propiedadId, lista);
    }
    return m;
  }

  /**
   * Unir (F-D13): las fotos de `origenId` pasan al final de `destinoId`, sin repetir contenido. Se llama antes de
   * borrar el origen, que si no se las lleva en cascada.
   */
  async mover(origenId: string, destinoId: string): Promise<void> {
    const [origen, destino] = await Promise.all([
      this.c.fotos.dePropiedad(origenId),
      this.c.fotos.dePropiedad(destinoId),
    ]);
    if (!origen.length) return;
    const huellas = new Set(destino.map((f) => f.sha256));
    let siguiente = destino.length ? Math.max(...destino.map((f) => f.orden)) + 1 : 0;
    const pasan: { id: string; orden: number; propiedadId: string }[] = [];
    const sobran: Foto[] = [];
    for (const f of origen) {
      if (huellas.has(f.sha256)) sobran.push(f);
      else {
        huellas.add(f.sha256);
        pasan.push({ id: f.id, orden: siguiente++, propiedadId: destinoId });
      }
    }
    await this.c.fotos.actualizar(pasan);
    for (const f of sobran) {
      await this.c.fotos.borrar(f.id);
      await this.c.almacen.borrar(f.archivo);
    }
    await this.compactar(destinoId);
  }

  /** Antes de borrar una propiedad: las filas se van en cascada, los archivos hay que borrarlos (F-D13). */
  async archivosDe(propiedadId: string): Promise<string[]> {
    return (await this.c.fotos.dePropiedad(propiedadId)).map((f) => f.archivo);
  }

  async borrarArchivos(archivos: string[]): Promise<void> {
    for (const a of archivos) await this.c.almacen.borrar(a);
  }
}
