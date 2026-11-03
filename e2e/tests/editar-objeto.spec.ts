// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * US-02.02 Editar un objeto (issue #51) · tests e2e de la tarea #171
 * Un test por criterio de aceptación (casos CP-EDI-01..05 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Se edita la
 * «Hidrolimpiadora Kärcher» de ana (8 €/día, fianza 50 €), que no usa ningún otro e2e, y se deja
 * como estaba al terminar cada test.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
type User = typeof ANA;

const ITEM = 'Hidrolimpiadora Kärcher';
const ORIGINAL = {
  title: ITEM,
  description: 'Hidrolimpiadora de 120 bar para terrazas, bicis y coches. Con lanza y cepillo.',
  dailyPrice: 8,
  deposit: 50,
};

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

async function openEditDialog(page: Page, title: string) {
  await page.getByRole('button', { name: `Editar ${title}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar objeto' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

// Busca el objeto de ana por el principio del nombre y lo deja como en el seed
async function findItemId(request: APIRequestContext, token: string): Promise<string> {
  const response = await request.get(`${API_URL}/usuarios/me/objetos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const items: { id: string; title: string }[] = await response.json();
  const item = items.find(({ title }) => title.startsWith(ITEM));
  expect(item, `objeto «${ITEM}» de ana`).toBeDefined();
  return item!.id;
}

async function restoreItem(request: APIRequestContext) {
  const token = await apiToken(request, ANA);
  const id = await findItemId(request, token);
  const response = await request.patch(`${API_URL}/objetos/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: ORIGINAL,
  });
  expect(response.status()).toBe(200);
}

test.describe('US-02.02 Editar un objeto', () => {
  test.afterEach(async ({ request }) => {
    await restoreItem(request);
  });

  // Criterio 1
  test('el propietario elige uno de sus objetos y «Editar» abre el formulario con sus datos', async ({
    page,
  }) => {
    await login(page, ANA);
    await openMyItems(page);

    const dialog = await openEditDialog(page, ITEM);

    await expect(dialog.getByLabel('Nombre')).toHaveValue(ORIGINAL.title);
    await expect(dialog.getByLabel('Descripción')).toHaveValue(ORIGINAL.description);
    await expect(dialog.getByLabel('Precio por día (€)')).toHaveValue(/^8([.,]00?)?$/);
    await expect(dialog.getByLabel('Fianza (€)')).toHaveValue(/^50([.,]00?)?$/);
  });

  // Criterio 2. La disponibilidad se cambia con «Pausar»/«Reanudar» en «Mis objetos» (US-02.04, #173)
  // y añadir fotos llega con US-02.01: aquí se prueban los campos del formulario
  test('se pueden modificar el nombre, la descripción, el precio y la fianza', async ({ page }) => {
    await login(page, ANA);
    await openMyItems(page);
    const dialog = await openEditDialog(page, ITEM);

    for (const label of ['Nombre', 'Descripción', 'Precio por día (€)', 'Fianza (€)']) {
      await expect(dialog.getByLabel(label)).toBeEditable();
    }
  });

  // Criterio 3
  test('al guardar con valores válidos los cambios quedan guardados', async ({ page }) => {
    await login(page, ANA);
    await openMyItems(page);
    const dialog = await openEditDialog(page, ITEM);
    const newTitle = `${ITEM} K2`;

    await dialog.getByLabel('Nombre').fill(newTitle);
    await dialog.getByLabel('Precio por día (€)').fill('11,50');
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(dialog).toBeHidden();
    // Siguen después de recargar: están en la BD, no solo en pantalla
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: newTitle })).toBeVisible();
    const reopened = await openEditDialog(page, newTitle);
    await expect(reopened.getByLabel('Nombre')).toHaveValue(newTitle);
    await expect(reopened.getByLabel('Precio por día (€)')).toHaveValue(/^11[.,]50?$/);
  });

  // Criterio 4
  test('con un precio no válido no se guarda y se indica el error', async ({ page }) => {
    await login(page, ANA);
    await openMyItems(page);
    const dialog = await openEditDialog(page, ITEM);

    await dialog.getByLabel('Precio por día (€)').fill('-5');
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(
      dialog.getByText(/^El campo "precio( por día)?" no es correcto, revísalo\.$/),
    ).toBeVisible();
    await expect(dialog.getByLabel('Precio por día (€)')).toHaveAttribute('aria-invalid', 'true');

    // El objeto conserva el precio anterior
    await page.reload();
    const reopened = await openEditDialog(page, ITEM);
    await expect(reopened.getByLabel('Precio por día (€)')).toHaveValue(/^8([.,]00?)?$/);
  });

  // Permisos
  test('quien no es el propietario no ve el objeto en «Mis objetos» ni lo puede editar', async ({
    page,
    request,
  }) => {
    await login(page, BRUNO);
    await openMyItems(page);
    await expect(page.getByRole('button', { name: `Editar ${ITEM}` })).toHaveCount(0);

    const id = await findItemId(request, await apiToken(request, ANA));
    const response = await request.patch(`${API_URL}/objetos/${id}`, {
      headers: { Authorization: `Bearer ${await apiToken(request, BRUNO)}` },
      data: { ...ORIGINAL, title: 'Cambiado por bruno' },
    });
    expect(response.status()).toBe(403);
  });
});
