import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{ts,tsx}'],
      setupFiles: ['tests/setup.ts'],
      // Cobertura (#272): solo con `npm run test:coverage`. Mínimos explicados en docs/testing.md.
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/**/*.d.ts'],
        reporter: ['text-summary', 'json-summary', 'html'],
        // Valor medido el 5/11/2026 menos 2 puntos. Solo se suben, nunca se bajan.
        thresholds: { statements: 91, branches: 87, functions: 94, lines: 93 },
      },
    },
  }),
);
