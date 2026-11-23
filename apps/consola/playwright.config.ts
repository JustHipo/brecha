import { defineConfig, devices } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// F1-15: flujo de F1-14 contra el núcleo real, sobre la base de pruebas (nunca la base de desarrollo).
const raiz = resolve(__dirname, '../..');
if (existsSync(join(raiz, '.env'))) process.loadEnvFile(join(raiz, '.env'));
const url = process.env.DATABASE_URL_PRUEBAS;
if (!url) throw new Error('Falta DATABASE_URL_PRUEBAS (ver .env.example)');

const NUCLEO = 4310;
const CONSOLA = 4210;
const dir = process.env.BRECHA_DIR_E2E ?? mkdtempSync(join(tmpdir(), 'brecha-e2e-'));
process.env.BRECHA_DIR_E2E = dir;
process.env.NUCLEO_E2E = String(NUCLEO);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/preparar.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${CONSOLA}`,
    viewport: { width: 1280, height: 860 },
    trace: 'retain-on-failure',
    locale: 'es-CL',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
    },
  ],
  webServer: [
    {
      command: 'node ../../services/nucleo/dist/main.js',
      url: `http://127.0.0.1:${NUCLEO}/api/v1/salud`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: url,
        NUCLEO_PUERTO: String(NUCLEO),
        CONSOLA_ORIGEN: `http://localhost:${CONSOLA}`,
        BRECHA_DIR: dir,
      },
    },
    {
      command: `pnpm exec ng serve --port ${CONSOLA} --proxy-config proxy.conf.cjs`,
      url: `http://localhost:${CONSOLA}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NUCLEO_PUERTO: String(NUCLEO), BRECHA_DIR: dir },
    },
  ],
});
