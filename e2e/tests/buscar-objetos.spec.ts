// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 02/11/2026
import { test, expect, type Page } from '@playwright/test';

/**
 * US-03.01 Buscar objetos (issue #56) · tests e2e de la tarea #116
 * Un test por criterio de aceptación (casos CP-BUS-01..05 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado: el seed crea los
 * objetos de backend/prisma/demoData.ts («Taladro percutor Bosch» publicado y «Tienda de
 * campaña para 4 personas» pausado).
 */
const HOME_PATH = '/';
const SEARCH_LABEL = '¿Qué quieres alquilar?';
const SEARCH_BUTTON = 'Buscar';

// Objetos del seed
const PUBLISHED_ITEM = 'Taladro percutor Bosch';
const UNRELATED_ITEM = 'Escalera de aluminio de 3 peldaños';
const PAUSED_ITEM = 'Tienda de campaña para 4 personas';

async function search(page: Page, text: string) {
  await page.getByLabel(SEARCH_LABEL).fill(text);
  await page.getByRole('button', { name: SEARCH_BUTTON }).click();
}

function results(page: Page) {
  return page.locator('.search-results');
}

test.describe('US-03.01 Buscar objetos', () => {
  // Criterio 1
  test('en la página inicial se puede escribir el nombre de un objeto', async ({ page }) => {
    await page.goto(HOME_PATH);

    const searchForm = page.getByRole('search');
    await expect(searchForm.getByLabel(SEARCH_LABEL)).toBeVisible();
    await expect(searchForm.getByRole('button', { name: SEARCH_BUTTON })).toBeVisible();
  });

  // Criterio 2
  test('al buscar se muestran los anuncios relacionados y ninguno más', async ({ page }) => {
    await page.goto(HOME_PATH);
    await search(page, 'taladro');

    await expect(page).toHaveURL('/buscar?q=taladro');
    await expect(page.getByRole('heading', { name: 'Resultados para «taladro»' })).toBeVisible();
    await expect(results(page).getByRole('link', { name: PUBLISHED_ITEM })).toBeVisible();
    await expect(results(page).getByRole('link', { name: UNRELATED_ITEM })).toHaveCount(0);

    // Todos los anuncios que salen tienen «taladro» en el nombre
    const titles = await results(page).getByRole('heading').allTextContents();
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title).toMatch(/taladro/i);
    }
  });

  // Criterio 2: el anuncio lleva a la ficha del objeto
  test('el anuncio enlaza a la página del objeto', async ({ page }) => {
    await page.goto('/buscar?q=taladro');

    await results(page).getByRole('link', { name: PUBLISHED_ITEM }).click();

    await expect(page).toHaveURL(/\/objetos\/[0-9a-f-]{36}$/);
  });

  // Criterio 3
  test('sin texto no se hace la búsqueda', async ({ page }) => {
    await page.goto(HOME_PATH);
    await search(page, '   ');

    await expect(page).toHaveURL(HOME_PATH);
    await expect(page.getByRole('heading', { name: /Resultados/ })).toHaveCount(0);
  });

  // Criterio 4
  test('si no hay resultados se muestra un mensaje', async ({ page }) => {
    await page.goto(HOME_PATH);
    await search(page, 'xyzzy-no-existe');

    await expect(
      page.getByText('No hemos encontrado ningún objeto para «xyzzy-no-existe».'),
    ).toBeVisible();
    await expect(results(page)).toHaveCount(0);
  });

  // Estado (CP-BUS-05): los objetos pausados no salen en la búsqueda. Los retirados no están en
  // el seed: los cubre el test de API de #114 (tests/api/searchItems.test.ts) y el e2e de #172.
  test('los objetos pausados no aparecen en los resultados', async ({ page }) => {
    // La búsqueda funciona para un objeto publicado: así el test puede fallar
    await page.goto('/buscar?q=taladro');
    await expect(results(page).getByRole('link', { name: PUBLISHED_ITEM })).toBeVisible();

    await search(page, 'tienda');

    await expect(page.getByText('No hemos encontrado ningún objeto para «tienda».')).toBeVisible();
    await expect(page.getByRole('link', { name: PAUSED_ITEM })).toHaveCount(0);
  });
});
