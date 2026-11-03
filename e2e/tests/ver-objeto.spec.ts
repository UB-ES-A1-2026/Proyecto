// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 02/11/2026
import { test, expect, type Page } from '@playwright/test';

/**
 * US-03.03 Ver un objeto (issue #58) · tests e2e de la tarea #175
 * Un test por criterio de aceptación (casos CP-VER-01..05 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Se llega a la
 * ficha desde la búsqueda (US-03.01), porque los ids del seed cambian en cada BD.
 */
const ITEM = {
  title: 'Taladro percutor Bosch',
  description: /Taladro percutor de 750 W con maletín/,
  price: /6,00\s€ \/ día/,
  owner: 'ana',
};

// Usuarios creados por `npm run db:seed`: el taladro es de ana
const OWNER = { email: 'ana@rentit.test', password: 'Rentit2026' };
const RENTER = { email: 'bruno@rentit.test', password: 'Rentit2026' };

const ITEM_URL = /\/objetos\/[0-9a-f-]{36}$/;

async function submitLogin(page: Page, user: { email: string; password: string }) {
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await submitLogin(page, user);
}

// Abre la ficha del taladro desde los resultados de búsqueda y devuelve su URL
async function openItemFromSearch(page: Page): Promise<string> {
  await page.goto('/buscar?q=taladro');
  await page.locator('.search-results').getByRole('link', { name: ITEM.title }).click();
  await expect(page).toHaveURL(ITEM_URL);
  await expect(page.getByRole('heading', { level: 1, name: ITEM.title })).toBeVisible();
  return page.url();
}

test.describe('US-03.03 Ver un objeto', () => {
  // Criterio 1
  test('al pulsar un anuncio de los resultados se abre la ficha de ese objeto', async ({
    page,
  }) => {
    await openItemFromSearch(page);
  });

  // Criterio 2
  test('la ficha muestra nombre, descripción, fotografías, precio por día y disponibilidad', async ({
    page,
  }) => {
    await openItemFromSearch(page);

    const detail = page.getByRole('article');
    await expect(detail.getByText(ITEM.description)).toBeVisible();
    await expect(detail.getByText(ITEM.price)).toBeVisible();
    await expect(detail.getByText('Disponible', { exact: true })).toBeVisible();
    // El seed no sube fotos: la ficha lo dice en lugar de dejar el hueco vacío. Cuando la
    // subida de fotos (US-02.01) esté en develop, este test pasará a comprobar las imágenes.
    await expect(
      detail.getByRole('img').or(detail.getByText('Este objeto no tiene fotos.')).first(),
    ).toBeVisible();
  });

  // Criterio 3
  test('se ve el nombre de usuario del propietario y no su correo', async ({ page }) => {
    await openItemFromSearch(page);

    await expect(page.getByText(`Publicado por ${ITEM.owner}`)).toBeVisible();
    await expect(page.getByRole('article')).not.toContainText('@rentit.test');
  });

  // Criterio 4a: con sesión, «Alquilar» empieza la solicitud (US-04.01)
  test('con sesión, «Alquilar» lleva a solicitar el alquiler', async ({ page }) => {
    await login(page, RENTER);
    const itemUrl = await openItemFromSearch(page);

    await page.getByRole('button', { name: 'Alquilar' }).click();

    await expect(page).toHaveURL(`${itemUrl}/solicitar`);
  });

  // Criterio 4b: sin sesión, «Alquilar» pide iniciar sesión
  test('sin sesión, «Alquilar» lleva al login y después vuelve a la ficha', async ({ page }) => {
    const itemUrl = await openItemFromSearch(page);

    await page.getByRole('button', { name: 'Alquilar' }).click();
    await expect(page).toHaveURL('/login');

    await submitLogin(page, RENTER);
    await expect(page).toHaveURL(itemUrl);
    await expect(page.getByRole('button', { name: 'Alquilar' })).toBeVisible();
  });

  // Criterio 4c: el propietario no puede alquilar su propio objeto
  test('el propietario ve que el anuncio es suyo y no tiene botón «Alquilar»', async ({ page }) => {
    await login(page, OWNER);
    await openItemFromSearch(page);

    await expect(page.getByText('Este anuncio es tuyo.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Alquilar' })).toHaveCount(0);
  });

  // Errores
  test('si el objeto no existe se muestra un mensaje y un enlace al inicio', async ({ page }) => {
    await page.goto('/objetos/00000000-0000-4000-8000-000000000000');

    await expect(
      page.getByRole('heading', { name: 'No hemos encontrado este objeto' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
  });
});
