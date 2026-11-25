import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AlmacenDeFotos } from '../aplicacion/puertos';

/** Solo `uuid.ext`: nada de carpetas, `..` ni separadores de ningún sistema (F-D4). */
const NOMBRE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;

function revisar(archivo: string): string {
  if (!NOMBRE.test(archivo)) throw new Error(`Nombre de foto no válido: ${archivo}`);
  return archivo;
}

/**
 * La carpeta `<instancia>/fotos` (docs/diseno/fotos-propiedades.md F-D4). En la app de escritorio la instancia sigue a
 * `BRECHA_DATOS`; la ruta se arma con `path.join`, así que sirve igual en macOS y en Windows.
 */
export class AlmacenDeFotosEnDisco implements AlmacenDeFotos {
  constructor(readonly carpeta: string) {}

  huella(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  /** Escribe a un nombre temporal y renombra: nunca queda una foto a medias con el nombre final. */
  async guardar(archivo: string, bytes: Uint8Array): Promise<void> {
    const destino = join(this.carpeta, revisar(archivo));
    await mkdir(this.carpeta, { recursive: true });
    const temporal = `${destino}.${randomBytes(4).toString('hex')}.parcial`;
    try {
      await writeFile(temporal, bytes, { flag: 'wx' });
      await rename(temporal, destino);
    } catch (e) {
      await rm(temporal, { force: true });
      throw e;
    }
  }

  async leer(archivo: string): Promise<Uint8Array | null> {
    try {
      return await readFile(join(this.carpeta, revisar(archivo)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async borrar(archivo: string): Promise<void> {
    await rm(join(this.carpeta, revisar(archivo)), { force: true });
  }
}
