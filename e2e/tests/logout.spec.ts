// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 20/10/2026
import { test, expect, type Page } from '@playwright/test';

/**
 * US-01.3 Cerrar sesión (issue #47)
 * Un test por criterio de aceptación.
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';

const LOGIN_PATH = '/login';
const HOME_PATH = '/';
const PROFILE_PATH = '/perfil'; // página privada

const EMAIL_LABEL = 'Correo electrónico';
const PASSWORD_LABEL = 'Contraseña';
const SUBMIT_BUTTON = 'Iniciar sesión';
const LOGOUT_BUTTON = 'Cerrar sesión';

// Endpoint privado de la API: devuelve 401 sin una sesión válida
const PRIVATE_ENDPOINT = `${API_URL}/usuarios/me`;
// Clave de localStorage donde el frontend guarda la sesión ({ token, expiresAt, user })
const SESSION_STORAGE_KEY = 'rentit.session';

// Usuario creado por `npm run db:seed`
const USER = { email: 'ana@rentit.test', password: 'Rentit2026' };

async function logIn(page: Page) {
  await page.goto(LOGIN_PATH);
  await page.getByLabel(EMAIL_LABEL).fill(USER.email);
  await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill(USER.password);
  await page.getByRole('button', { name: SUBMIT_BUTTON }).click();
  await expect(page).toHaveURL(HOME_PATH);
  await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toBeVisible();
}

// Espera a que termine el logout (llamada a la API incluida): el botón lleva al login
async function logOut(page: Page) {
  await page.getByRole('button', { name: LOGOUT_BUTTON }).click();
  await expect(page).toHaveURL(LOGIN_PATH);
}

async function readToken(page: Page): Promise<string | undefined> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY);
  if (raw === null) return undefined;
  const session: unknown = JSON.parse(raw);
  return typeof session === 'object' && session !== null && 'token' in session
    ? String(session.token)
    : undefined;
}

test.describe('US-01.3 Cerrar sesión', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  // Criterio 1
  test('el usuario con sesión iniciada ve un botón "Cerrar sesión"', async ({ page }) => {
    await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toBeVisible();
  });

  // Criterio 2
  test('al pulsar "Cerrar sesión" se redirige al login y deja de estar autenticado', async ({ page }) => {
    await logOut(page);

    await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toHaveCount(0);
    expect(await readToken(page)).toBeUndefined();
  });

  // Criterio 3
  test('tras cerrar sesión, una ruta privada redirige al inicio de sesión', async ({ page }) => {
    await logOut(page);

    await page.goto(PROFILE_PATH);

    await expect(page).toHaveURL(LOGIN_PATH);
  });

  // Criterio 4
  test('tras cerrar sesión, el token anterior ya no es válido (401)', async ({ page, request }) => {
    const token = await readToken(page);
    expect(token).toBeDefined();
    const headers = { Authorization: `Bearer ${token}` };

    // Antes del logout el token funciona…
    expect((await request.get(PRIVATE_ENDPOINT, { headers })).status()).toBe(200);

    await logOut(page);

    // …y después la API lo rechaza
    expect((await request.get(PRIVATE_ENDPOINT, { headers })).status()).toBe(401);
  });

  // Criterio 5
  test('tras cerrar sesión, el botón "atrás" no muestra contenido privado', async ({ page }) => {
    // Navegamos dentro de la app para que el perfil quede en el historial
    await page.getByRole('link', { name: 'Mi perfil' }).click();
    await expect(page).toHaveURL(PROFILE_PATH);
    await expect(page.getByText(USER.email)).toBeVisible();

    await page.getByRole('link', { name: 'Rentit' }).click();
    await expect(page).toHaveURL(HOME_PATH);

    await logOut(page);
    await page.goBack(); // vuelve a /perfil en el historial

    await expect(page).toHaveURL(LOGIN_PATH);
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toHaveCount(0);
    await expect(page.getByText(USER.email)).toHaveCount(0);
    await expect(page.getByRole('button', { name: LOGOUT_BUTTON })).toHaveCount(0);
  });
});
