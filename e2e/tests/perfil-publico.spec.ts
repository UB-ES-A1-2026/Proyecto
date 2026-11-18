/**
 * US-01.4 Perfil público (issue #48) · tests e2e de la tarea #336
 * Generado con asistencia de IA (Claude) – revisado por Danyal Anwar, 18/11/2026
 *
 * Datos del seed (backend/prisma/demoSeed.ts): ana tiene bio y publica el «Taladro percutor Bosch»;
 * su «Tienda de campaña para 4 personas» está pausada y no sale en el perfil. Nadie tiene foto ni
 * valoraciones. Los tests que editan usan una cuenta nueva (POST /auth/register): no cambian la bio
 * de ana y se pueden repetir sin volver a cargar el seed.
 * Sin S3 (local y CI) no se pueden subir fotos: el test de la foto simula el almacenamiento.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
const ANA_BIO = 'Vecina de Sants. Alquilo herramientas y cosas de jardín.';
const ITEM = 'Taladro percutor Bosch';
const PAUSED_ITEM = 'Tienda de campaña para 4 personas';
const PROFILE_URL = /\/usuarios\/[0-9a-f-]{36}$/;
const OWN_PROFILE = 'Tu perfil · así lo ven los demás';
const NOT_FOUND = 'No hemos encontrado este usuario.';
const BIO_ERROR = 'El campo "bio" no es correcto, revísalo.';
// PNG real de 1×1 px: el navegador la vuelve a dibujar antes de subirla.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

type Credentials = { email: string; password: string };

async function login(page: Page, user: Credentials) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function apiLogin(request: APIRequestContext, user: Credentials) {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  const { token, user: me } = await response.json();
  return { token: token as string, id: me.id as string };
}

// Cuenta nueva con datos únicos, para editar sin tocar las del seed
async function newAccount(request: APIRequestContext) {
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const user = { username: `perfil_${id}`, email: `perfil${id}@rentit.test`, password: PASSWORD };
  const response = await request.post(`${API_URL}/auth/register`, { data: user });
  expect(response.status()).toBe(201);
  return user;
}

// Ficha del taladro → «Publicado por ana» → perfil de ana
async function openAnaFromItem(page: Page) {
  await page.goto('/buscar?q=taladro');
  await page.locator('.search-results').getByRole('link', { name: ITEM }).click();
  await expect(page.getByRole('heading', { level: 1, name: ITEM })).toBeVisible();

  const owner = page.getByRole('region', { name: 'Propietario' });
  await expect(owner).toContainText('Publicado por');
  await owner.getByRole('link', { name: 'ana' }).click();

  await expect(page).toHaveURL(PROFILE_URL);
  await expect(page.getByRole('heading', { level: 1, name: 'ana' })).toBeVisible();
  await expect(page.getByText(ANA_BIO)).toBeVisible();
}

async function openMyProfile(page: Page) {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mi perfil' })
    .click();
  await expect(page).toHaveURL(PROFILE_URL);
  await expect(page.getByText(OWN_PROFILE)).toBeVisible();
}

async function openEditDialog(page: Page) {
  await page.getByRole('button', { name: 'Editar perfil' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar perfil' });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Lo que solo ve el dueño del perfil no debe salir
async function expectNotOwner(page: Page) {
  await expect(page.getByRole('button', { name: 'Editar perfil' })).toHaveCount(0);
  await expect(page.getByText(OWN_PROFILE)).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Objetos publicados' }).getByRole('link', {
      name: 'Publicar un objeto',
    }),
  ).toHaveCount(0);
  await expect(page.getByText('ana@rentit.test')).toHaveCount(0);
}

test.describe('US-01.4 Perfil público', () => {
  // Criterio 1
  test('desde la ficha de un objeto, el nombre del propietario lleva a su perfil público', async ({
    page,
  }) => {
    await openAnaFromItem(page);

    await expect(page.getByText('Todavía sin valoraciones')).toBeVisible();
    await expect(page.getByText(/^Miembro desde \d{1,2} de \p{L}+ de \d{4}$/u)).toBeVisible();

    // No se compara el número de objetos: otros e2e publican y retiran objetos
    const items = page.getByRole('region', { name: 'Objetos publicados' });
    await expect(items.getByRole('link', { name: ITEM })).toBeVisible();
    await expect(items.getByText(PAUSED_ITEM)).toHaveCount(0);

    await items.getByRole('link', { name: ITEM }).click();
    await expect(page).toHaveURL(/\/objetos\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: ITEM })).toBeVisible();
  });

  // Criterio 2 (y 3: el correo no lo ven los demás)
  test('con otra cuenta no aparece «Editar perfil» ni el correo', async ({ page }) => {
    await login(page, BRUNO);
    await openAnaFromItem(page);

    await expectNotOwner(page);
  });

  // Criterio 2 (y 3)
  test('sin sesión el perfil se ve, pero sin «Editar perfil» ni el correo', async ({ page }) => {
    await openAnaFromItem(page);

    await expectNotOwner(page);
  });

  // Criterio 2
  test('la API solo deja editar el propio perfil', async ({ request }) => {
    const ana = await apiLogin(request, ANA);
    const bruno = await apiLogin(request, BRUNO);

    // Sin sesión: 401
    const anonymous = await request.patch(`${API_URL}/usuarios/me`, { data: { bio: 'Hola' } });
    expect(anonymous.status()).toBe(401);

    // No hay ninguna ruta para editar a otra persona: solo /usuarios/me
    const other = await request.patch(`${API_URL}/usuarios/${ana.id}`, {
      headers: { Authorization: `Bearer ${bruno.token}` },
      data: { bio: 'Bio cambiada por bruno' },
    });
    expect(other.status()).toBe(404);

    const profile = await request.get(`${API_URL}/usuarios/${ana.id}`);
    expect((await profile.json()).bio).toBe(ANA_BIO);
  });

  // Criterio 3
  test('«Mi perfil» lleva al perfil propio con «Editar perfil» y el correo', async ({ page }) => {
    await login(page, ANA);
    await openMyProfile(page);

    await expect(page.getByRole('heading', { level: 1, name: 'ana' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar perfil' })).toBeVisible();
    await expect(page.getByText('ana@rentit.test')).toBeVisible();
    await expect(page.getByText('solo lo ves tú')).toBeVisible();

    // /perfil también lleva aquí
    const ownProfileUrl = page.url();
    await page.goto('/perfil');
    await expect(page).toHaveURL(ownProfileUrl);
    await expect(page.getByText(OWN_PROFILE)).toBeVisible();
  });

  // Flujo 2: editar la bio
  test('al guardar una bio nueva el perfil se actualiza y se mantiene al recargar', async ({
    page,
    request,
  }) => {
    await login(page, await newAccount(request));
    await openMyProfile(page);
    await expect(page.getByText('Añade una bio para que los demás te conozcan.')).toBeVisible();

    const dialog = await openEditDialog(page);
    await expect(dialog.getByText('Opcional. Máximo 500 caracteres (0/500).')).toBeVisible();
    const bio = 'Me gustan las herramientas y la montaña.';
    await dialog.getByLabel('Bio').fill(bio);
    await expect(
      dialog.getByText(`Opcional. Máximo 500 caracteres (${bio.length}/500).`),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'Perfil actualizado.' })).toBeVisible();
    await expect(page.getByText(bio)).toBeVisible();

    await page.reload();
    await expect(page.getByText(bio)).toBeVisible();
  });

  // Error: bio de más de 500 caracteres
  test('la bio no pasa de 500 caracteres y una más larga da error', async ({ page, request }) => {
    const user = await newAccount(request);
    await login(page, user);
    await openMyProfile(page);
    const dialog = await openEditDialog(page);
    const bioField = dialog.getByLabel('Bio');

    // El campo no deja escribir el carácter 501
    await bioField.fill('a'.repeat(501));
    await expect(bioField).toHaveValue('a'.repeat(500));
    await expect(dialog.getByText('Opcional. Máximo 500 caracteres (500/500).')).toBeVisible();

    // Sin ese límite del navegador, «Guardar» marca el campo y no lo envía
    await bioField.evaluate((field) => field.removeAttribute('maxlength'));
    await bioField.fill('a'.repeat(501));
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByText(BIO_ERROR)).toBeVisible();
    await expect(bioField).toHaveAttribute('aria-invalid', 'true');
    await expect(bioField).toBeFocused();

    // Y la API la rechaza
    const { token } = await apiLogin(request, user);
    const response = await request.patch(`${API_URL}/usuarios/me`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { bio: 'a'.repeat(501) },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: BIO_ERROR, field: 'bio' });
  });

  // Error: foto que no es JPG, PNG o WebP, o de más de 5 MB
  test('una foto que no es JPG, PNG o WebP o de más de 5 MB da error', async ({
    page,
    request,
  }) => {
    const user = await newAccount(request);
    await login(page, user);
    await openMyProfile(page);
    const photoRequests: string[] = [];
    page.on('request', (sent) => {
      if (sent.url().includes('/usuarios/me/foto')) photoRequests.push(sent.url());
    });

    const dialog = await openEditDialog(page);
    await dialog.getByLabel('Elegir una foto de perfil').setInputFiles({
      name: 'foto.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a'),
    });
    await expect(dialog.getByRole('alert')).toHaveText(
      'Solo se pueden subir fotos JPG, PNG o WebP.',
    );
    expect(photoRequests).toEqual([]);

    // Más de 5 MB: el navegador la reduce antes de subirla, así que se prueba en la API
    const { token } = await apiLogin(request, user);
    const tooBig = await request.post(`${API_URL}/usuarios/me/foto/subida`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { contentType: 'image/png', size: 6 * 1024 * 1024 },
    });
    expect(tooBig.status()).toBe(400);
    expect(await tooBig.json()).toEqual({
      error: 'La foto no puede ocupar más de 5 MB.',
      field: 'size',
    });
  });

  // Flujo 2: cambiar la foto y la bio a la vez (almacenamiento simulado)
  test('al guardar una foto y una bio nuevas el perfil muestra las dos', async ({
    page,
    request,
  }) => {
    const user = await newAccount(request);
    const { token, id } = await apiLogin(request, user);
    const bio = 'Con foto nueva.';
    const photoUrl = 'https://fotos.rentit.test/perfil.png';
    const profileResponse = await request.get(`${API_URL}/usuarios/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profile = await profileResponse.json();
    const cors = { 'Access-Control-Allow-Origin': '*' };

    // Los tres pasos de la subida: pedir la URL, subir al bucket y confirmar
    await page.route('**/api/usuarios/me/foto/subida', (route) =>
      route.fulfill({
        status: 201,
        headers: cors,
        json: {
          key: `usuarios/${id}/perfil.webp`,
          uploadUrl: 'https://bucket.rentit.test/subida',
          expiresIn: 300,
        },
      }),
    );
    await page.route('https://bucket.rentit.test/**', (route) =>
      route.fulfill({ status: 200, headers: cors }),
    );
    await page.route('**/api/usuarios/me/foto', (route) =>
      route.fulfill({ status: 200, headers: cors, json: { ...profile, bio, photo: photoUrl } }),
    );
    await page.route(photoUrl, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }),
    );

    await login(page, user);
    await openMyProfile(page);
    const dialog = await openEditDialog(page);
    await dialog.getByLabel('Elegir una foto de perfil').setInputFiles({
      name: 'perfil.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    });
    await expect(dialog.getByRole('button', { name: 'Cambiar foto' })).toBeVisible();
    await dialog.getByLabel('Bio').fill(bio);
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'Perfil actualizado.' })).toBeVisible();
    await expect(page.getByText(bio)).toBeVisible();
    await expect(page.locator('.public-profile-header .user-avatar img')).toHaveAttribute(
      'src',
      photoUrl,
    );
  });

  // Error: el usuario no existe
  test('un usuario que no existe muestra «No hemos encontrado este usuario.»', async ({ page }) => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'xyz']) {
      await page.goto(`/usuarios/${id}`);
      await expect(page.getByRole('alert')).toHaveText(NOT_FOUND);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
    }

    await page.getByRole('link', { name: 'Volver al inicio' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});