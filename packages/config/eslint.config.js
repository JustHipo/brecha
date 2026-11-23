// Configuración base de ESLint (flat config) para los paquetes TypeScript de Brecha.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export const base = tseslint.config(
  { ignores: ['**/dist/**', '**/generado/**', '**/coverage/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);

export default base;
