import { test, expect } from '@playwright/test';

/**
 * US-01.1 Registro (issue #45)
 * Un test por criterio de aceptación.
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado.
 */
const REGISTER_PATH = '/registro';
const HOME_PATH = '/';

const USERNAME_LABEL = 'Nombre de usuario';
const EMAIL_LABEL = 'Correo electrónico';
const PASSWORD_LABEL = 'Contraseña';
const SUBMIT_BUTTON = 'Crear cuenta';

// Mensaje del criterio de aceptación; aceptamos "esta" con y sin tilde
const FIELD_ERROR = /no est[aá] correctamente introducido/i;

// Usuario creado por `npm run db:seed`
const EXISTING_EMAIL = 'ana@rentit.test';

// Datos únicos por ejecución (también si los tests corren en paralelo)
function uniqueUser() {
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return { username: `usuario_${id}`, email: `usuario${id}@rentit.test` };
}

test.describe('US-01.1 Registro', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(REGISTER_PATH);
  });

  // Criterio 1
  test('el usuario ve los campos de nombre de usuario, correo y contraseña', async ({ page }) => {
    await expect(page.getByLabel(USERNAME_LABEL)).toBeVisible();
    await expect(page.getByLabel(EMAIL_LABEL)).toBeVisible();
    await expect(page.getByLabel(PASSWORD_LABEL, { exact: true })).toBeVisible();
  });

  // Criterio 2
  test('con datos válidos se crea la cuenta y se accede a la página inicial', async ({ page }) => {
    const user = uniqueUser();

    await page.getByLabel(USERNAME_LABEL).fill(user.username);
    await page.getByLabel(EMAIL_LABEL).fill(user.email);
    await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill('Rentit2026');
    await page.getByRole('button', { name: SUBMIT_BUTTON }).click();

    await expect(page).toHaveURL(HOME_PATH);
    // La sesión queda iniciada: la cabecera muestra el perfil y el botón de cerrar sesión
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });

  // Criterio 3a: falta algún dato obligatorio
  test('si falta un dato obligatorio no se crea la cuenta y se indica el error', async ({ page }) => {
    await page.getByLabel(USERNAME_LABEL).fill('usuario_test');
    // correo y contraseña vacíos
    await page.getByRole('button', { name: SUBMIT_BUTTON }).click();

    await expect(page).toHaveURL(REGISTER_PATH);
    await expect(page.getByLabel(EMAIL_LABEL)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(PASSWORD_LABEL, { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(
      page.getByText(/"correo electrónico".*no est[aá] correctamente introducido/i),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toHaveCount(0);
  });

  // Criterio 3b: correo ya registrado
  test('si el correo ya está registrado no se crea la cuenta y se indica el error', async ({ page }) => {
    await page.getByLabel(USERNAME_LABEL).fill(uniqueUser().username);
    await page.getByLabel(EMAIL_LABEL).fill(EXISTING_EMAIL);
    await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill('Rentit2026');
    await page.getByRole('button', { name: SUBMIT_BUTTON }).click();

    await expect(page.getByLabel(EMAIL_LABEL)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(FIELD_ERROR)).toBeVisible();
    await expect(page).toHaveURL(REGISTER_PATH);
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toHaveCount(0);
  });

  // Criterio 4: mostrar / ocultar contraseña
  test('el campo contraseña tiene un botón para mostrar y ocultar el texto', async ({ page }) => {
    const password = page.getByLabel(PASSWORD_LABEL, { exact: true });
    await password.fill('Rentit2026');
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /mostrar contraseña/i }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('Rentit2026');

    await page.getByRole('button', { name: /ocultar contraseña/i }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });
});
