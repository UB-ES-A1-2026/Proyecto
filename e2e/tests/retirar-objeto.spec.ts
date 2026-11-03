// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * US-02.03 Retirar un objeto (issue #52) · tests e2e de la tarea #172
 * Un test por criterio de aceptación (casos CP-RET-01..05 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Retirar no se puede
 * deshacer, así que solo se retira la «Máquina de palomitas» de bruno, que no usa ningún otro
 * e2e. El seed la vuelve a dejar publicada.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
type User = typeof ANA;

// De bruno: es el que se retira de verdad
const WITHDRAWN_ITEM = 'Máquina de palomitas';
// De ana: se abre la confirmación y se cancela, o lo intenta retirar bruno
const KEPT_ITEM = 'Silla de coche para bebé';
// De ana, con una solicitud aceptada en el seed (#210)
const BUSY_ITEM = 'Escalera de aluminio de 3 peldaños';

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

function itemRow(page: Page, title: string) {
  return page.locator('.item-row', { hasText: title });
}

async function openWithdrawDialog(page: Page, title: string) {
  await page.getByRole('button', { name: `Retirar anuncio ${title}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Retirar anuncio' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

async function findMyItem(request: APIRequestContext, user: User, title: string): Promise<MyItem> {
  const response = await request.get(`${API_URL}/usuarios/me/objetos`, {
    headers: { Authorization: `Bearer ${await apiToken(request, user)}` },
  });
  expect(response.status()).toBe(200);
  const items: MyItem[] = await response.json();
  const item = items.find((candidate) => candidate.title === title);
  expect(item, `objeto «${title}» de ${user.email}`).toBeDefined();
  return item!;
}

// Lo que ve otro usuario, en una sesión aparte
async function pageAs(browser: Browser, user: User) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return { page, close: () => context.close() };
}

test.describe('US-02.03 Retirar un objeto', () => {
  // Criterio 1
  test('el propietario elige un anuncio en «Mis objetos» y «Retirar anuncio» pide confirmación', async ({
    page,
  }) => {
    await login(page, ANA);
    await openMyItems(page);

    const dialog = await openWithdrawDialog(page, KEPT_ITEM);

    await expect(dialog).toContainText(`¿Seguro que quieres retirar «${KEPT_ITEM}»?`);
    await expect(dialog.getByRole('button', { name: 'Retirar anuncio' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
  });

  // Criterio 2
  test('al confirmar, el anuncio deja de verse y nadie puede solicitar su alquiler', async ({
    page,
    request,
    browser,
  }) => {
    const item = await findMyItem(request, BRUNO, WITHDRAWN_ITEM);
    expect(item.status, 'ya está retirada: vuelve a ejecutar `npm run db:seed`').toBe('published');

    await login(page, BRUNO);
    await openMyItems(page);
    const dialog = await openWithdrawDialog(page, WITHDRAWN_ITEM);
    await dialog.getByRole('button', { name: 'Retirar anuncio' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('El anuncio se ha retirado.')).toBeVisible();
    // Sigue en «Mis objetos», marcado como retirado y sin acciones
    await expect(itemRow(page, WITHDRAWN_ITEM).locator('.item-status')).toHaveText('Retirado');
    await expect(
      page.getByRole('button', { name: `Retirar anuncio ${WITHDRAWN_ITEM}` }),
    ).toHaveCount(0);

    // Para ana ya no existe: no sale en la búsqueda y la ficha no se puede abrir
    const ana = await pageAs(browser, ANA);
    await ana.page.goto('/buscar?q=palomitas');
    await expect(
      ana.page.getByText('No hemos encontrado ningún objeto para «palomitas».'),
    ).toBeVisible();
    await ana.page.goto(`/objetos/${item.id}`);
    await expect(
      ana.page.getByRole('heading', { name: 'No hemos encontrado este objeto' }),
    ).toBeVisible();
    await expect(ana.page.getByRole('button', { name: 'Alquilar' })).toHaveCount(0);
    await ana.close();
  });

  // Criterio 3
  test('al cancelar no cambia nada y el anuncio sigue publicado', async ({ page, request }) => {
    await login(page, ANA);
    await openMyItems(page);
    const dialog = await openWithdrawDialog(page, KEPT_ITEM);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await expect(dialog).toBeHidden();
    await expect(itemRow(page, KEPT_ITEM).locator('.item-status')).toHaveText('Publicado');
    expect((await findMyItem(request, ANA, KEPT_ITEM)).status).toBe('published');

    await page.goto('/buscar?q=silla');
    await expect(
      page.locator('.search-results').getByRole('link', { name: KEPT_ITEM }),
    ).toBeVisible();
  });

  // Criterio 4
  test('quien no es el propietario no lo puede retirar', async ({ page, request }) => {
    const item = await findMyItem(request, ANA, KEPT_ITEM);

    await login(page, BRUNO);
    await page.goto(`/objetos/${item.id}`);
    await expect(page.getByRole('heading', { level: 1, name: KEPT_ITEM })).toBeVisible();
    await expect(page.getByRole('button', { name: /Retirar anuncio/ })).toHaveCount(0);

    const response = await request.post(`${API_URL}/objetos/${item.id}/retirar`, {
      headers: { Authorization: `Bearer ${await apiToken(request, BRUNO)}` },
    });
    expect(response.status()).toBe(403);
    expect((await findMyItem(request, ANA, KEPT_ITEM)).status).toBe('published');
  });

  // Supuesto de #110: con reservas activas no se puede retirar
  test('un anuncio con reservas activas no se puede retirar y se indica por qué', async ({
    page,
    request,
  }) => {
    await login(page, ANA);
    await openMyItems(page);
    const dialog = await openWithdrawDialog(page, BUSY_ITEM);

    await dialog.getByRole('button', { name: 'Retirar anuncio' }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'No puedes retirar un objeto con reservas activas.',
    );
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(itemRow(page, BUSY_ITEM).locator('.item-status')).toHaveText('Publicado');
    expect((await findMyItem(request, ANA, BUSY_ITEM)).status).toBe('published');
  });
});
