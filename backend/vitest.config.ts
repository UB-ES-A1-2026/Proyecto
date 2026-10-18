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
  },
});
