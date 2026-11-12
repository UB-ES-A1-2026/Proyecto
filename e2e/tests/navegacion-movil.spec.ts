// Generado con asistencia de IA (Claude)
import { expect, test, type Page } from '@playwright/test';

/**
 * Navegación (#258): en el móvil, barra inferior fija con iconos; en escritorio, enlaces de texto.
 * Usuario creado por `npm run db:seed`.
 */
const USER = { email: 'ana@rentit.test', password: 'Rentit2026' };

function mainNav(page: Page) {
  return page.getByRole('navigation', { name: 'Principal' });
}

async function logIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(USER.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(USER.password);
  await page.locator('form').getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(mainNav(page).getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

test.describe('Navegación en el móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sin sesión, la barra inferior lleva a inicio, iniciar sesión y crear cuenta', async ({
    page,
  }) => {
    await page.goto('/');

    const nav = mainNav(page);
    await expect(nav.getByRole('link')).toHaveText(['Inicio', 'Iniciar sesión', 'Crear cuenta']);
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveCount(0);

    const box = await nav.boundingBox();
    expect(box?.y).toBeGreaterThan(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(844);
    expect(box?.width).toBe(390);
  });

  test('con sesión, la barra lleva a cada sección y marca la actual', async ({ page }) => {
    await logIn(page);

    const nav = mainNav(page);
    await expect(nav.getByRole('link')).toHaveText([
      'Inicio',
      'Mis objetos',
      'Mis solicitudes',
      'Mi perfil',
    ]);

    await nav.getByRole('link', { name: 'Mis solicitudes' }).click();
    await expect(page).toHaveURL('/mis-solicitudes');
    await expect(nav.getByRole('link', { name: 'Mis solicitudes' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await nav.getByRole('link', { name: 'Mi perfil' }).click();
    await expect(page).toHaveURL(/\/usuarios\/[\w-]+$/);
    await nav.getByRole('link', { name: 'Inicio' }).click();
    await expect(page).toHaveURL('/');
  });

  test('la barra no tapa el final de la página ni hay scroll horizontal', async ({ page }) => {
    await logIn(page);
    await page.goto('/perfil');
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    const footer = await page.getByRole('contentinfo').boundingBox();
    const bar = await mainNav(page).boundingBox();
    expect((footer?.y ?? 0) + (footer?.height ?? 0)).toBeLessThanOrEqual(bar?.y ?? 0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test('en escritorio, el menú está en la cabecera y «Inicio» no se muestra', async ({ page }) => {
  await logIn(page);

  const nav = mainNav(page);
  await expect(nav.getByRole('link', { name: 'Inicio' })).toBeHidden();
  const box = await nav.boundingBox();
  expect(box?.y).toBeLessThan(64);
});
