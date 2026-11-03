// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * US-02.04 Pausar un objeto (issue #53) · tests e2e de la tarea #173
 * Un test por criterio de aceptación (casos CP-PAU-01..04 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Se pausa la «Tabla
 * de paddle surf hinchable» de ana y, al terminar cada test, se reanuda por la API si ha quedado
 * pausada, para no cambiar lo que ven los e2e de buscar y filtrar.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
type User = typeof ANA;

const ITEM = 'Tabla de paddle surf hinchable';
const SEARCH = '/buscar?q=paddle';
const PAUSED_MESSAGE =
  'El anuncio se ha pausado: no aparecerá en las búsquedas hasta que lo reanudes.';
const RESUMED_MESSAGE = 'El anuncio se ha reanudado y vuelve a aparecer en las búsquedas.';

type MyItem = { id: string; title: string; status: string };

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

async function openMyItems(page: Page) {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mis objetos' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mis objetos' })).toBeVisible();
}

function itemStatus(page: Page) {
  return page.locator('.item-row', { hasText: ITEM }).locator('.item-status');
}

async function pauseFromMyItems(page: Page) {
  await login(page, ANA);
  await openMyItems(page);
  await page.getByRole('button', { name: `Pausar ${ITEM}` }).click();
  await expect(page.getByText(PAUSED_MESSAGE)).toBeVisible();
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

async function findItem(request: APIRequestContext, token: string): Promise<MyItem> {
  const response = await request.get(`${API_URL}/usuarios/me/objetos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const items: MyItem[] = await response.json();
  const item = items.find(({ title }) => title === ITEM);
  expect(item, `objeto «${ITEM}» de ana`).toBeDefined();
  return item!;
}

// Lo que ve bruno, en una sesión aparte
async function searchAsBruno(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, BRUNO);
  await page.goto(SEARCH);
  return { page, close: () => context.close() };
}

test.describe('US-02.04 Pausar un objeto', () => {
  test.afterEach(async ({ request }) => {
    const token = await apiToken(request, ANA);
    const item = await findItem(request, token);
    if (item.status === 'paused') {
      const response = await request.post(`${API_URL}/objetos/${item.id}/reanudar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status()).toBe(200);
    }
  });

  // Criterio 1
  test('un objeto pausado no aparece en la búsqueda', async ({ page, browser }) => {
    await pauseFromMyItems(page);

    const bruno = await searchAsBruno(browser);
    await expect(
      bruno.page.getByText('No hemos encontrado ningún objeto para «paddle».'),
    ).toBeVisible();
    await expect(bruno.page.getByRole('link', { name: ITEM })).toHaveCount(0);
    await bruno.close();
  });

  // Criterio 1: sigue en «Mis objetos»
  test('el objeto pausado sigue en «Mis objetos», marcado como pausado y con «Reanudar»', async ({
    page,
  }) => {
    await pauseFromMyItems(page);

    // Después de recargar: el estado está guardado, no solo en pantalla
    await page.reload();
    await expect(itemStatus(page)).toHaveText('Pausado');
    await expect(page.locator('.item-row', { hasText: ITEM })).toContainText(
      'No aparece en las búsquedas hasta que lo reanudes',
    );
    await expect(page.getByRole('button', { name: `Reanudar ${ITEM}` })).toBeVisible();
  });

  // Reanudar
  test('al reanudarlo vuelve a aparecer en la búsqueda', async ({ page, browser }) => {
    await pauseFromMyItems(page);

    await page.getByRole('button', { name: `Reanudar ${ITEM}` }).click();

    await expect(page.getByText(RESUMED_MESSAGE)).toBeVisible();
    await expect(itemStatus(page)).toHaveText('Publicado');
    await expect(page.getByRole('button', { name: `Pausar ${ITEM}` })).toBeVisible();

    const bruno = await searchAsBruno(browser);
    await expect(
      bruno.page.locator('.search-results').getByRole('link', { name: ITEM }),
    ).toBeVisible();
    await bruno.close();
  });

  // Permisos
  test('quien no es el propietario no lo puede pausar', async ({ page, request }) => {
    await login(page, BRUNO);
    await openMyItems(page);
    await expect(page.getByRole('button', { name: `Pausar ${ITEM}` })).toHaveCount(0);

    const item = await findItem(request, await apiToken(request, ANA));
    const response = await request.post(`${API_URL}/objetos/${item.id}/pausar`, {
      headers: { Authorization: `Bearer ${await apiToken(request, BRUNO)}` },
    });
    expect(response.status()).toBe(403);
    expect((await findItem(request, await apiToken(request, ANA))).status).toBe('published');
  });
});
