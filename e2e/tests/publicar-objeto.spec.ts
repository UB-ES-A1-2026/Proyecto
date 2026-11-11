// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
import { test, expect, type Page } from '@playwright/test';

/**
 * US-02.01 Publicar un objeto (issue #50) · tests e2e de la tarea #107
 * Un test por criterio de aceptación (casos CP-PUB-01..07 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Se publica sin
 * fotos: la subida va a S3 y no hay almacenamiento en el CI (las fotos son opcionales).
 * Cada anuncio lleva un nombre único para poder repetir los tests.
 */
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
type User = typeof ANA;

const CATEGORIES = [
  'Camping y viajes',
  'Deporte',
  'Electrónica',
  'Fiestas y eventos',
  'Herramientas y bricolaje',
  'Hogar y jardín',
  'Infantil',
  'Otros',
];

function uniqueTitle(): string {
  return `Lijadora e2e ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function openPublishForm(page: Page) {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mis objetos' })
    .click();
  await page.getByRole('link', { name: 'Publicar un objeto' }).click();
  await expect(page).toHaveURL('/objetos/nuevo');
  await expect(page.getByRole('heading', { level: 1, name: 'Publicar un objeto' })).toBeVisible();
}

async function fillValidItem(page: Page, title: string) {
  await page.getByLabel('Nombre').fill(title);
  await page.getByLabel('Descripción').fill('Lijadora orbital con 10 lijas de grano variado.');
  await page.getByLabel('Categoría').selectOption({ label: 'Herramientas y bricolaje' });
  await page.getByLabel('Precio por día (€)').fill('7,50');
  await page.getByLabel('Fianza (€)').fill('20');
  await page.getByLabel('Barrio').fill('Sants');
  // Desde US-05.01 (#281) hace falta al menos un modo de entrega. «Punto de recogida» no pide
  // dirección, que el formulario aún no tiene (T27, #307).
  await page.getByLabel('Punto de recogida').check();
}

// Publica un objeto válido y devuelve la URL de su ficha
async function publish(page: Page, title: string): Promise<string> {
  await openPublishForm(page);
  await fillValidItem(page, title);
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page).toHaveURL(/\/objetos\/[0-9a-f-]{36}$/);
  return page.url();
}

test.describe('US-02.01 Publicar un objeto', () => {
  // Criterio 1
  test('se ven los campos del anuncio y el botón «Publicar»', async ({ page }) => {
    await login(page, ANA);
    await openPublishForm(page);

    await expect(page.getByLabel('Nombre')).toBeVisible();
    await expect(page.getByLabel('Descripción')).toBeVisible();
    await expect(page.getByLabel('Fotografías')).toBeAttached();
    await expect(page.getByLabel('Precio por día (€)')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Disponibilidad' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publicar' })).toBeVisible();
  });

  // Criterio 2
  test('se puede elegir una de las 8 categorías', async ({ page }) => {
    await login(page, ANA);
    await openPublishForm(page);
    const category = page.getByLabel('Categoría');

    const options = (await category.getByRole('option').allTextContents()).slice(1);
    expect(options.sort()).toEqual(CATEGORIES);

    await category.selectOption({ label: 'Deporte' });
    await expect(category.locator('option:checked')).toHaveText('Deporte');
  });

  // Criterio 3
  test('con datos válidos se publica el anuncio con esos datos', async ({ page }) => {
    await login(page, ANA);
    const title = uniqueTitle();

    await publish(page, title);

    const detail = page.getByRole('article');
    await expect(detail.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(detail.getByText('Lijadora orbital con 10 lijas de grano variado.')).toBeVisible();
    await expect(detail.getByText(/^7,50\s€ \/ día$/)).toBeVisible();
    await expect(detail.getByText(/^Fianza: 20,00\s€$/)).toBeVisible();
    await expect(detail.getByText('Disponible', { exact: true })).toBeVisible();
    await expect(detail.getByText('Herramientas y bricolaje')).toBeVisible();
    await expect(detail.getByText('Sants')).toBeVisible();

    // Y ya sale en la búsqueda
    await page.goto(`/buscar?q=${encodeURIComponent(title)}`);
    await expect(page.locator('.search-results').getByRole('link', { name: title })).toBeVisible();
  });

  // Criterio 4
  test('el anuncio queda asociado a quien lo publica', async ({ page }) => {
    await login(page, ANA);
    const itemUrl = await publish(page, uniqueTitle());

    await expect(page.getByText('Publicado por ana')).toBeVisible();
    await expect(page.getByText('Este anuncio es tuyo.')).toBeVisible();

    // Para bruno es un anuncio de otra persona: puede alquilarlo
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await login(page, BRUNO);
    await page.goto(itemUrl);
    await expect(page.getByText('Publicado por ana')).toBeVisible();
    await expect(page.getByLabel('Fecha de inicio')).toBeVisible();
  });

  // Criterio 5a: campo erróneo
  test('con un precio no válido no se publica y se indica el error en el precio', async ({
    page,
  }) => {
    await login(page, ANA);
    await openPublishForm(page);
    const title = uniqueTitle();
    await fillValidItem(page, title);
    await page.getByLabel('Precio por día (€)').fill('0');

    await page.getByRole('button', { name: 'Publicar' }).click();

    await expect(page.getByText('El campo "precio" no es correcto, revísalo.')).toBeVisible();
    await expect(page.getByLabel('Precio por día (€)')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL('/objetos/nuevo');
    await page.goto(`/buscar?q=${encodeURIComponent(title)}`);
    await expect(page.getByText(/No hemos encontrado ningún objeto/)).toBeVisible();
  });

  // Criterio 5b: campo obligatorio vacío
  test('sin nombre no se publica y se indica el error en el nombre', async ({ page }) => {
    await login(page, ANA);
    await openPublishForm(page);
    await fillValidItem(page, uniqueTitle());
    await page.getByLabel('Nombre').fill('');

    await page.getByRole('button', { name: 'Publicar' }).click();

    await expect(page.getByText('El campo "nombre" no es correcto, revísalo.')).toBeVisible();
    await expect(page.getByLabel('Nombre')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL('/objetos/nuevo');
  });

  // Acceso
  test('sin sesión, la pantalla de publicar lleva al login', async ({ page }) => {
    await page.goto('/objetos/nuevo');

    await expect(page).toHaveURL('/login');
  });
});
