import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const testEnvironment = loadEnv('test', process.cwd(), '');
Object.assign(process.env, testEnvironment);
process.env.PORT ??= '3000';
process.env.CORS_ORIGINS ??= '';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['./tests/setup/globalSetup.ts'],
    // Cobertura (#272): solo con `npm run test:coverage`. Mínimos explicados en docs/testing.md.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/types/**'],
      reporter: ['text-summary', 'json-summary', 'html'],
      // Valor medido el 5/11/2026 menos 2 puntos. Solo se suben, nunca se bajan.
      thresholds: { statements: 90, branches: 91, functions: 93, lines: 90 },
    },
  },
});
