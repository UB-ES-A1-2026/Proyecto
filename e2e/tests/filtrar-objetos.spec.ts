// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
import { test, expect, type Page } from '@playwright/test';

/**
 * US-03.02 Filtrar objetos (issue #57) · tests e2e de la tarea #174
 * Un test por criterio de aceptación (casos CP-FIL-01..07 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Objetos del seed
 * (backend/prisma/demoData.ts) que usan estos tests:
 * - Deporte: «Bicicleta de montaña talla M» (10 €, Poblenou) y «Tabla de paddle surf» (15 €).
 * - Hasta 4 €/día: «Carro de la compra» (2 €), «Escalera de aluminio» (3 €) y «Silla de coche» (4 €).
 * - Sant Andreu: 4 objetos publicados.
 */
const PRICE_LABEL = 'Precio máximo (€/día)';

async function openFilters(page: Page) {
  await page.getByRole('button', { name: /^Filtros/ }).click();
  return page.getByRole('form', { name: 'Filtros' });
}

async function applyFilters(page: Page) {
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
}

function cards(page: Page) {
  return page.locator('.search-result-card');
}

async function resultTitles(page: Page): Promise<string[]> {
  await expect(cards(page).first()).toBeVisible();
  return (await cards(page).getByRole('heading').allTextContents()).sort();
}

// «5,00 € / día» → 5
async function resultPrices(page: Page): Promise<number[]> {
  const texts = await cards(page)
    .getByText(/€ \/ día/)
    .allTextContents();
  return texts.map((text) => Number(text.replace(/[^\d,]/g, '').replace(',', '.')));
}

test.describe('US-03.02 Filtrar objetos', () => {
  // Criterio 1
  test('desde la búsqueda se abren los filtros de categoría, precio máximo y barrio', async ({
    page,
  }) => {
    await page.goto('/buscar?q=taladro');

    const filters = await openFilters(page);

    await expect(page.getByRole('button', { name: /^Filtros/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(filters.getByLabel('Categoría')).toBeVisible();
    await expect(filters.getByLabel(PRICE_LABEL)).toBeVisible();
    await expect(filters.getByLabel('Barrio')).toBeVisible();
  });

  // Criterios 2 y 3: categoría
  test('al filtrar por categoría solo salen objetos de esa categoría', async ({ page }) => {
    await page.goto('/buscar');
    const filters = await openFilters(page);

    await filters.getByLabel('Categoría').selectOption({ label: 'Deporte' });
    await applyFilters(page);

    await expect(page).toHaveURL(/categoryId=[0-9a-f-]{36}/);
    expect(await resultTitles(page)).toEqual([
      'Bicicleta de montaña talla M',
      'Tabla de paddle surf hinchable',
    ]);
    for (const card of await cards(page).all()) {
      await expect(card).toContainText('· Deporte');
    }
  });

  // Criterios 2 y 3: precio máximo, incluido el propio límite
  test('al filtrar por precio máximo solo salen objetos de ese precio o menos', async ({
    page,
  }) => {
    await page.goto('/buscar');
    const filters = await openFilters(page);

    await filters.getByLabel(PRICE_LABEL).fill('4');
    await applyFilters(page);

    await expect(page).toHaveURL(/maxPrice=4/);
    expect(await resultTitles(page)).toEqual([
      'Carro de la compra plegable',
      'Escalera de aluminio de 3 peldaños',
      'Silla de coche para bebé',
    ]);
    for (const price of await resultPrices(page)) {
      expect(price).toBeLessThanOrEqual(4);
    }
  });

  // Criterios 2 y 3: ubicación (barrio)
  test('al filtrar por barrio solo salen objetos de ese barrio', async ({ page }) => {
    await page.goto('/buscar');
    const filters = await openFilters(page);

    await filters.getByLabel('Barrio').fill('sant andreu');
    await applyFilters(page);

    await expect(cards(page)).toHaveCount(4);
    for (const card of await cards(page).all()) {
      await expect(card).toContainText('Sant Andreu ·');
    }
  });

  // Criterio 4
  test('se pueden aplicar varios filtros a la vez y quitar solo uno', async ({ page }) => {
    await page.goto('/buscar');
    const filters = await openFilters(page);

    await filters.getByLabel('Categoría').selectOption({ label: 'Deporte' });
    await filters.getByLabel(PRICE_LABEL).fill('10');
    await applyFilters(page);

    expect(await resultTitles(page)).toEqual(['Bicicleta de montaña talla M']);
    await expect(page.getByRole('button', { name: 'Filtros (2)' })).toBeVisible();

    // Al quitar el precio, vuelve la tabla de paddle (15 €) y se mantiene la categoría
    await page.getByRole('button', { name: 'Quitar filtro Hasta 10 €/día' }).click();

    // Espera a los nuevos resultados antes de leerlos
    await expect(cards(page)).toHaveCount(2);
    expect(await resultTitles(page)).toEqual([
      'Bicicleta de montaña talla M',
      'Tabla de paddle surf hinchable',
    ]);
    await expect(page.getByRole('button', { name: 'Filtros (1)' })).toBeVisible();
  });

  // Criterio 5
  test('«Limpiar filtros» quita los filtros y vuelven todos los objetos de la búsqueda', async ({
    page,
  }) => {
    await page.goto('/buscar?q=taladro');
    const filters = await openFilters(page);
    await filters.getByLabel(PRICE_LABEL).fill('2');
    await applyFilters(page);
    await expect(page.getByText('No hay objetos que cumplan estos filtros.')).toBeVisible();

    await page.getByRole('button', { name: 'Limpiar filtros' }).last().click();

    await expect(page).toHaveURL('/buscar?q=taladro');
    await expect(cards(page).getByRole('link', { name: 'Taladro percutor Bosch' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toBeVisible();
  });

  // Validación
  test('con un precio máximo no válido no se aplica el filtro y se ve el error', async ({
    page,
  }) => {
    await page.goto('/buscar?q=taladro');
    const filters = await openFilters(page);

    await filters.getByLabel(PRICE_LABEL).fill('-5');
    await applyFilters(page);

    await expect(filters.getByRole('alert')).toHaveText(
      'El campo "precio máximo" no es correcto, revísalo.',
    );
    await expect(filters.getByLabel(PRICE_LABEL)).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL('/buscar?q=taladro');
  });
});
