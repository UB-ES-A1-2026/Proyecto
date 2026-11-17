import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{ts,tsx}'],
      setupFiles: ['tests/setup.ts'],
      // Los tests usan siempre la tarjeta simulada, aunque haya una clave en frontend/.env.
      env: { VITE_STRIPE_PUBLISHABLE_KEY: '' },
    },
  }),
);
