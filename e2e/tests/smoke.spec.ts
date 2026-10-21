// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 20/10/2026
import { test, expect } from '@playwright/test';

/**
 * Smoke test (T19, issue #99)
 * Comprobación rápida de que la aplicación arranca y el flujo básico funciona:
 * la API responde, la home carga y un usuario nuevo puede registrarse e iniciar sesión.
 * Es lo que se ejecuta en el CI (`npm run test:smoke`).
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';

const PASSWORD = 'Rentit2026';

function uniqueUser() {
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return { username: `smoke_${id}`, email: `smoke${id}@rentit.test` };
}

test.describe('Smoke', { tag: '@smoke' }, () => {
  test('la API está en marcha', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('la página inicial carga sin errores', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Rentit' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('un usuario nuevo se registra, cierra sesión y vuelve a iniciar sesión', async ({ page }) => {
    const user = uniqueUser();

    // Registro
    await page.goto('/registro');
    await page.getByLabel('Nombre de usuario').fill(user.username);
    await page.getByLabel('Correo electrónico').fill(user.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('heading', { name: `Hola, ${user.username}` })).toBeVisible();

    // Cierre de sesión
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL('/login');

    // Inicio de sesión con la cuenta recién creada
    await page.getByLabel('Correo electrónico').fill(user.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: `Hola, ${user.username}` })).toBeVisible();
  });
});
