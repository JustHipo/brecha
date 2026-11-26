import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAXIMO = 5 * 1024 * 1024;

/** Un archivo de registro por pieza en ~/Library/Logs/Brecha, con una rotación simple a `.1`. */
export class Registro {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  ruta(nombre: string): string {
    return join(this.dir, `${nombre}.log`);
  }

  escribir(nombre: string, texto: string): void {
    const ruta = this.ruta(nombre);
    if (existsSync(ruta) && statSync(ruta).size > MAXIMO) renameSync(ruta, `${ruta}.1`);
    const hora = new Date().toISOString();
    const lineas = texto
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => `${hora} ${l}\n`)
      .join('');
    if (lineas) appendFileSync(ruta, lineas);
  }
}
