// electron-builder no copia carpetas `node_modules` en extraResources: las del núcleo se agregan aquí,
// después de armar la app y antes de firmarla o de armar el instalador. Se quitan los enlaces rotos (pnpm deja
// uno al propio paquete), porque la firma de macOS falla con ellos.
// macOS: Brecha.app/Contents/Resources · Windows: win-unpacked/resources
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
  const recursos =
    contexto.electronPlatformName === 'darwin'
      ? join(contexto.appOutDir, `${contexto.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : join(contexto.appOutDir, 'resources');
  const origen = join(__dirname, '..', 'empaquetado', 'nucleo', 'node_modules');
  const destino = join(recursos, 'nucleo', 'node_modules');
  // En Windows se copian los archivos de verdad (sin enlaces ni junctions): el instalador NSIS no los lleva.
  cpSync(origen, destino, {
    recursive: true,
    verbatimSymlinks: contexto.electronPlatformName === 'darwin',
    dereference: contexto.electronPlatformName !== 'darwin',
  });
  const rotos = quitarEnlacesRotos(destino);
  console.log(`  • dependencias del núcleo copiadas (${rotos} enlaces rotos quitados)`);
};
