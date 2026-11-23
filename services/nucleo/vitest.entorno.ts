// Carga el .env de la raíz del monorepo si existe (en el CI las variables vienen del job).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../../.env');
if (existsSync(raiz)) process.loadEnvFile(raiz);
