// Arma Brecha.app y el .dmg para macOS (Apple Silicon), sin firma de Apple (D39: firma ad hoc).
// Junta: la consola compilada, el núcleo con sus dependencias de producción, PostgreSQL 17 con pgvector
// y el servicio con IA compilado con PyInstaller (D37). Uso: pnpm --filter escritorio empaquetar
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const aqui = resolve(import.meta.dirname, '..');
const repo = resolve(aqui, '..', '..');
const salida = join(aqui, 'empaquetado');
const correr = (cmd, args, cwd = repo) => {
  console.log(`\n▸ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
};

const soloEmpaquetar = process.argv.includes('--sin-compilar');
if (!soloEmpaquetar) {
  correr('pnpm', ['--filter', 'consola', 'build']);
  correr('pnpm', ['--filter', 'nucleo', 'build']);
  correr('pnpm', ['--filter', 'ia', 'empaquetar']);
}
correr('node', [join(aqui, 'scripts', 'preparar-postgres.mjs')]);

// Núcleo: dependencias de producción con `pnpm deploy`, más dist y las migraciones (están en .gitignore o fuera de `files`).
const nucleo = join(salida, 'nucleo');
rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });
correr('pnpm', ['--filter', 'nucleo', 'deploy', '--prod', '--legacy', nucleo]);
for (const d of ['dist', join('prisma', 'migrations')]) {
  rmSync(join(nucleo, d), { recursive: true, force: true });
  cpSync(join(repo, 'services', 'nucleo', d), join(nucleo, d), { recursive: true });
}
for (const d of ['src', 'test', 'coverage']) rmSync(join(nucleo, d), { recursive: true, force: true });
// `pnpm deploy` deja al workspace creyendo que le faltan dependencias: se reconcilia sin preguntar.
const reconciliar = () =>
  execFileSync('pnpm', ['install', '--frozen-lockfile'], {
    cwd: repo,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  });
reconciliar();

const ia = join(repo, 'services', 'ia', 'dist', 'brecha-ia', 'brecha-ia');
const consola = join(repo, 'apps', 'consola', 'dist', 'consola', 'browser', 'index.html');
for (const [nombre, ruta] of [
  ['servicio con IA', ia],
  ['consola', consola],
]) {
  if (!existsSync(ruta)) throw new Error(`Falta ${nombre}: ${ruta}`);
}

correr('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], aqui);
correr('pnpm', ['exec', 'electron-builder', '--mac', 'dmg', '--arm64', '--publish', 'never'], aqui);
// `pnpm deploy` deja al workspace creyendo que le faltan dependencias: se reconcilia sin preguntar.
execFileSync('pnpm', ['install', '--frozen-lockfile'], {
  cwd: repo,
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' },
});
console.log(`\nListo: ${join(aqui, 'empaquetado', 'app')}`);
