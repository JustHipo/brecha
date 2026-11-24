// Arma Brecha para el sistema donde corre, sin firma (D39 en macOS; W-j en Windows):
// - macOS arm64: Brecha.app y el .dmg (firma ad hoc).
// - Windows x64: el instalador NSIS por usuario (Brecha-Setup-<versión>.exe), sin pedir administrador.
// Junta: la consola compilada, el núcleo con sus dependencias de producción, PostgreSQL 17 con pgvector
// y el servicio con IA compilado con PyInstaller (D37). Uso: pnpm --filter escritorio empaquetar
// `--sin-compilar` usa la consola, el núcleo y brecha-ia ya compilados (en el CI se compilan en pasos aparte).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const windows = process.platform === 'win32';
const aqui = resolve(import.meta.dirname, '..');
const repo = resolve(aqui, '..', '..');
const salida = join(aqui, 'empaquetado');
// En Windows `pnpm` es un .cmd: hace falta la shell (y comillas para los argumentos con espacios).
const comillas = (a) => (windows && /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const correr = (cmd, args, cwd = repo, env = process.env) => {
  console.log(`\n▸ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, windows ? args.map(comillas) : args, { cwd, stdio: 'inherit', env, shell: windows });
};
// `pnpm deploy` deja al workspace creyendo que le faltan dependencias: se reconcilia sin preguntar.
const reconciliar = () =>
  correr('pnpm', ['install', '--frozen-lockfile'], repo, { ...process.env, CI: 'true' });

if (!['darwin', 'win32'].includes(process.platform)) {
  throw new Error(`Brecha se empaqueta en macOS o Windows (aquí: ${process.platform})`);
}
const soloEmpaquetar = process.argv.includes('--sin-compilar');
if (!soloEmpaquetar) {
  correr('pnpm', ['--filter', 'consola', 'build']);
  correr('pnpm', ['--filter', 'nucleo', 'build']);
  correr('pnpm', ['--filter', 'ia', 'empaquetar']);
}
correr('node', [join(aqui, 'scripts', 'preparar-postgres.mjs')]);

// Núcleo: dependencias de producción con `pnpm deploy`, más dist y las migraciones (están en .gitignore o fuera de `files`).
// En Windows, node_modules plano (hoisted): sin la carpeta .pnpm anidada ni enlaces, que el instalador no lleva
// y que alargan las rutas.
const nucleo = join(salida, 'nucleo');
rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });
correr('pnpm', [
  '--filter',
  'nucleo',
  'deploy',
  '--prod',
  '--legacy',
  ...(windows ? ['--config.node-linker=hoisted'] : []),
  nucleo,
]);
for (const d of ['dist', join('prisma', 'migrations')]) {
  rmSync(join(nucleo, d), { recursive: true, force: true });
  cpSync(join(repo, 'services', 'nucleo', d), join(nucleo, d), { recursive: true });
}
for (const d of ['src', 'test', 'coverage']) rmSync(join(nucleo, d), { recursive: true, force: true });
reconciliar();

const ia = join(repo, 'services', 'ia', 'dist', 'brecha-ia', windows ? 'brecha-ia.exe' : 'brecha-ia');
const consola = join(repo, 'apps', 'consola', 'dist', 'consola', 'browser', 'index.html');
for (const [nombre, ruta] of [
  ['servicio con IA', ia],
  ['consola', consola],
]) {
  if (!existsSync(ruta)) throw new Error(`Falta ${nombre}: ${ruta}`);
}

correr('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], aqui);
correr(
  'pnpm',
  [
    'exec',
    'electron-builder',
    ...(windows ? ['--win', 'nsis', '--x64'] : ['--mac', 'dmg', '--arm64']),
    '--publish',
    'never',
  ],
  aqui,
);
reconciliar();
console.log(`\nListo: ${join(aqui, 'empaquetado', 'app')}`);
