// pnpm --filter nucleo perfil cargar <archivo.json>
// Carga el perfil de búsqueda de Empleo en el núcleo que esté corriendo (docs/diseno/perfil.md §6).
// Usa NUCLEO_URL y BRECHA_DIR (carpeta con token-servicio) del .env de la raíz; para la app instalada en macOS:
//   NUCLEO_URL=http://127.0.0.1:4300 BRECHA_DIR="$HOME/Library/Application Support/Brecha/instancia" pnpm --filter nucleo perfil cargar ../../datos/privado/perfil-empleo.json
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { cargarPerfil, validarSemilla } from './cargar-perfil';

async function main(): Promise<void> {
  const raiz = resolve(__dirname, '../../../../../..');
  if (existsSync(resolve(raiz, '.env'))) process.loadEnvFile(resolve(raiz, '.env'));
  const [orden, archivo] = process.argv.slice(2);
  if (orden !== 'cargar' || !archivo) {
    console.error('Uso: pnpm --filter nucleo perfil cargar <archivo.json>');
    process.exit(2);
  }
  // pnpm --filter corre en services/nucleo: las rutas relativas se leen desde donde lo llamaste.
  const base = process.env['INIT_CWD'] ?? process.cwd();
  const ruta = isAbsolute(archivo) ? archivo : resolve(base, archivo);
  const dir = process.env['BRECHA_DIR'] ?? './.brecha';
  const carpeta = isAbsolute(dir) ? dir : resolve(raiz, dir);
  const token = readFileSync(resolve(carpeta, 'token-servicio'), 'utf8').trim();
  const url = process.env['NUCLEO_URL'] ?? 'http://127.0.0.1:4300';

  const semilla = validarSemilla(JSON.parse(readFileSync(ruta, 'utf8')));
  const r = await cargarPerfil(semilla, { url, token });
  if (r.accion === 'igual') console.log(`El perfil de ${url} ya estaba igual al archivo: no cambié nada.`);
  else console.log(`Perfil cargado en ${url}:\n${r.reglas.map((x) => `- ${x}`).join('\n')}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
