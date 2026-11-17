import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const testEnvironment = loadEnv('test', process.cwd(), '');
Object.assign(process.env, testEnvironment);
// Los tests nunca hablan con Stripe, aunque haya una clave en backend/.env (US-07.01, T10 #285).
process.env.STRIPE_SECRET_KEY = '';
process.env.PORT ??= '3000';
process.env.CORS_ORIGINS ??= '';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['./tests/setup/globalSetup.ts'],
  },
});
