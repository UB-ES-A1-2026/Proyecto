// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 20/10/2026
import { test, expect, type Page } from '@playwright/test';

/**
 * US-01.2 Inicio de sesión (issue #46)
 * Un test por criterio de aceptación.
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado.
 */
const LOGIN_PATH = '/login';
const HOME_PATH = '/';
const PROFILE_PATH = '/perfil'; // página privada: sin sesión redirige al login

const EMAIL_LABEL = 'Correo electrónico';
const PASSWORD_LABEL = 'Contraseña';
const SUBMIT_BUTTON = 'Iniciar sesión';

// El criterio dice: El campo "X" no es correcto, revísalo (aceptamos "revisalo" sin tilde)
const EMAIL_ERROR = /"correo electrónico" no es correcto, rev[ií]salo/i;
const PASSWORD_ERROR = /"contraseña" no es correcto, rev[ií]salo/i;

// Usuario creado por `npm run db:seed`
const USER = { username: 'ana', email: 'ana@rentit.test', password: 'Rentit2026' };

async function fillAndSubmit(page: Page, email: string, password: string) {
  await page.getByLabel(EMAIL_LABEL).fill(email);
  await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill(password);
  await page.getByRole('button', { name: SUBMIT_BUTTON }).click();
}

// La cabecera solo muestra «Mi perfil» y «Cerrar sesión» con la sesión iniciada
async function expectLoggedIn(page: Page) {
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function expectLoggedOut(page: Page) {
  await expect(page).toHaveURL(LOGIN_PATH);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
}

test.describe('US-01.2 Inicio de sesión', () => {
  // Criterio 1
  test('el usuario ve los campos de correo electrónico y contraseña', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await expect(page.getByLabel(EMAIL_LABEL)).toBeVisible();
    await expect(page.getByLabel(PASSWORD_LABEL, { exact: true })).toBeVisible();
  });

  // Criterio 2: vuelve a la página en la que estaba, con la sesión iniciada
  test('con credenciales correctas vuelve a la página privada en la que estaba', async ({ page }) => {
    await page.goto(PROFILE_PATH);
    await expect(page).toHaveURL(LOGIN_PATH);

    await fillAndSubmit(page, USER.email, USER.password);

    await expect(page).toHaveURL(PROFILE_PATH);
    await expectLoggedIn(page);
  });

  test('con credenciales correctas desde la página inicial vuelve a ella con la sesión iniciada', async ({ page }) => {
    await page.goto(HOME_PATH);
    // En la home hay dos enlaces «Iniciar sesión»: usamos el de la cabecera
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Iniciar sesión' })
      .click();

    await fillAndSubmit(page, USER.email, USER.password);

    await expect(page).toHaveURL(HOME_PATH);
    await expect(page.getByRole('heading', { name: `Hola, ${USER.username}` })).toBeVisible();
    await expectLoggedIn(page);
  });

  // Criterio 3a: contraseña errónea
  test('con una contraseña incorrecta no inicia sesión y se indica el error', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await fillAndSubmit(page, USER.email, 'ContraseñaMal123');

    await expect(page.getByText(PASSWORD_ERROR)).toBeVisible();
    await expect(page.getByLabel(PASSWORD_LABEL, { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expectLoggedOut(page);
  });

  // Criterio 3b: correo que no existe
  test('con un correo que no existe no inicia sesión y se indica el error', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await fillAndSubmit(page, 'noexiste@rentit.test', USER.password);

    await expect(page.getByText(EMAIL_ERROR)).toBeVisible();
    await expect(page.getByLabel(EMAIL_LABEL)).toHaveAttribute('aria-invalid', 'true');
    await expectLoggedOut(page);
  });

  // Criterio 3c: campos vacíos
  test('con campos vacíos no inicia sesión y se indica el error', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    await page.getByRole('button', { name: SUBMIT_BUTTON }).click();

    await expect(page.getByText(EMAIL_ERROR)).toBeVisible();
    await expect(page.getByText(PASSWORD_ERROR)).toBeVisible();
    await expectLoggedOut(page);
  });

  // Criterio 4: mostrar / ocultar contraseña
  test('el campo contraseña tiene un botón para mostrar y ocultar el texto', async ({ page }) => {
    await page.goto(LOGIN_PATH);

    const password = page.getByLabel(PASSWORD_LABEL, { exact: true });
    await password.fill(USER.password);
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /mostrar contraseña/i }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue(USER.password);

    await page.getByRole('button', { name: /ocultar contraseña/i }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });
});
