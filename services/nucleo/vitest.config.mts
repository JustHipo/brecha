import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC emite la metadata de los decoradores que Nest necesita para inyectar dependencias.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['./vitest.entorno.ts'],
    globalSetup: ['./vitest.global.ts'],
    // Las pruebas de integración comparten la base de pruebas: un archivo a la vez.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/dominio/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.prueba.ts'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
