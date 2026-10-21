import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Un test cada vez: en paralelo, los servidores de desarrollo no aguantan y fallan por timeout
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // En el CI, anotaciones en GitHub; en local, salida en la terminal y el informe HTML sin abrir el servidor
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    // Frontend de Vite en local (`npm run dev` en frontend/)
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
