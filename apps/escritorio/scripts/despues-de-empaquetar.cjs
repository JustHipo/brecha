// electron-builder no copia carpetas `node_modules` en extraResources: las del núcleo se agregan aquí,
// después de armar el .app y antes de firmarlo. Se quitan los enlaces rotos (pnpm deja uno al propio paquete),
// porque la firma falla con ellos.
const { cpSync, existsSync, lstatSync, readdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');

function quitarEnlacesRotos(dir) {
  let quitados = 0;
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    const info = lstatSync(ruta);
    if (info.isSymbolicLink()) {
      if (!existsSync(ruta)) {
        rmSync(ruta);
        quitados += 1;
      }
    } else if (info.isDirectory()) {
      quitados += quitarEnlacesRotos(ruta);
    }
  }
  return quitados;
}

exports.default = async function despuesDeEmpaquetar(contexto) {
  const app = join(contexto.appOutDir, `${contexto.packager.appInfo.productFilename}.app`);
  const origen = join(__dirname, '..', 'empaquetado', 'nucleo', 'node_modules');
  const destino = join(app, 'Contents', 'Resources', 'nucleo', 'node_modules');
  cpSync(origen, destino, { recursive: true, verbatimSymlinks: true });
  const rotos = quitarEnlacesRotos(destino);
  console.log(`  • dependencias del núcleo copiadas (${rotos} enlaces rotos quitados)`);
};
