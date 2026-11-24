/**
 * US-11.03 Aceptar o rechazar solicitudes de rider (issue #305) · tests e2e de la tarea #319
 * Generado con asistencia de IA (Claude) – revisado por Danyal Anwar, 20/11/2026
 *
 * Datos del seed: admin@rentit.test es el admin; carla tiene la solicitud pendiente, dani es rider
 * aceptado y eva está rechazada con el motivo «Zona sin cobertura de reparto por ahora.».
 * carla no se toca: hazte-rider.spec.ts la necesita pendiente. Los tests que aceptan o rechazan
 * crean antes su propio rider con datos únicos (POST /api/riders), así que se pueden repetir sin
 * volver a cargar el seed.
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ADMIN = { email: 'admin@rentit.test', password: PASSWORD };
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const EVA = { email: 'eva@rentit.test', password: PASSWORD };
const EVA_REASON = 'Zona sin cobertura de reparto por ahora.';
const ALREADY_REVIEWED = 'Esta solicitud ya se ha revisado.';

type User = { email: string; password: string };
type Rider = User & { username: string; zone: string };
type Application = { id: string; status: string; user: { username: string } };

// Entra con otra cuenta en la misma página: primero se borra la sesión guardada
async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Un rider nuevo con la solicitud pendiente, con nombre y zona únicos
async function newRider(request: APIRequestContext): Promise<Rider> {
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const rider = {
    username: `rider_${id}`,
    email: `rider_${id}@rentit.test`,
    password: PASSWORD,
    zone: `Zona e2e ${id}`,
  };
  const response = await request.post(`${API_URL}/riders`, {
    data: {
      username: rider.username,
      email: rider.email,
      password: PASSWORD,
      phone: '612345678',
      zone: rider.zone,
      vehicle: 'bike',
      days: ['monday', 'saturday'],
      slots: ['morning'],
      acceptedTerms: true,
    },
  });
  expect(response.status()).toBe(201);
  return rider;
}

async function applicationOf(request: APIRequestContext, username: string): Promise<Application> {
  const response = await request.get(`${API_URL}/admin/riders`, {
    headers: auth(await apiToken(request, ADMIN)),
  });
  expect(response.status()).toBe(200);
  const applications: Application[] = await response.json();
  const application = applications.find((candidate) => candidate.user.username === username);
  expect(application, `No está la solicitud de ${username}`).toBeTruthy();
  return application as Application;
}

const LAMP = 'Lámpara de pie e2e';

// Retira por la API (como admin) un objeto; si ya está retirado, no pasa nada
async function withdrawByApi(request: APIRequestContext, itemId: string) {
  await request.post(`${API_URL}/admin/objetos/${itemId}/retirar`, {
    headers: auth(await apiToken(request, ADMIN)),
    data: { reason: 'other', details: 'Limpieza del e2e del panel.' },
  });
}

// Si una ejecución anterior falló a medias, su lámpara sigue publicada y saldría en otros e2e
// (filtrar-objetos.spec.ts): se retira antes de empezar
async function withdrawLeftoverLamps(request: APIRequestContext) {
  const response = await request.get(`${API_URL}/objetos`, { params: { q: LAMP } });
  const { items } = await response.json();
  for (const item of items as { id: string; title: string }[]) {
    if (item.title.startsWith(LAMP)) await withdrawByApi(request, item.id);
  }
}

async function openApplications(page: Page) {
  await page
    .getByRole('navigation', { name: 'Administración' })
    .getByRole('link', {
      name: 'Solicitudes',
    })
    .click();
  await expect(page).toHaveURL(/\/admin\/solicitudes$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Solicitudes de rider' })).toBeVisible();
}

function filter(page: Page, label: 'Pendientes' | 'Aceptadas' | 'Rechazadas'): Locator {
  return page
    .getByRole('group', { name: 'Filtrar por estado' })
    .getByRole('button', { name: new RegExp(`^${label} · \\d+$`) });
}

function applicationCard(page: Page, username: string): Locator {
  return page.locator('.rider-card').filter({
    has: page.getByRole('button', { name: new RegExp(`^${username} · `) }),
  });
}

async function expand(card: Locator, username: string) {
  await card.getByRole('button', { name: new RegExp(`^${username} · `) }).click();
}

// Pulsa un botón de la tarjeta hasta ver su resultado: si la lista se vuelve a pintar justo en el
// clic, el clic se pierde y se repite
async function clickUntil(button: Locator, result: Locator) {
  await expect(async () => {
    if (!(await result.isVisible())) await button.click({ timeout: 2_000 });
    await expect(result).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

test.describe('US-11.03 Aceptar o rechazar solicitudes de rider', () => {
  // Las tarjetas se despliegan con una transición: sin animaciones, los botones no se mueven al pulsar
  test.use({ reducedMotion: 'reduce' });

  // Criterio 1
  test('solo el admin ve «Panel» y puede usar la API de las solicitudes', async ({
    page,
    request,
  }) => {
    await login(page, ANA);
    await expect(page.getByRole('link', { name: 'Panel' })).toHaveCount(0);
    await page.goto('/admin/solicitudes');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Solicitudes de rider' })).toHaveCount(0);

    const asUser = await request.get(`${API_URL}/admin/riders`, {
      headers: auth(await apiToken(request, ANA)),
    });
    expect(asUser.status()).toBe(403);
    const anonymous = await request.get(`${API_URL}/admin/riders`);
    expect(anonymous.status()).toBe(401);

    // El admin entra directamente al panel, con su menú
    await login(page, ADMIN);
    await expect(page).toHaveURL(/\/admin$/);
    const menu = page.getByRole('navigation', { name: 'Administración' });
    for (const section of ['Resumen', 'Objetos', 'Riders activos', 'Solicitudes']) {
      await expect(menu.getByRole('link', { name: section })).toBeVisible();
    }
  });

  // Criterio 2
  test('las pendientes salen de la más antigua a la más nueva con las respuestas del cuestionario', async ({
    page,
    request,
  }) => {
    const rider = await newRider(request);
    await login(page, ADMIN);
    await openApplications(page);
    await expect(filter(page, 'Pendientes')).toHaveAttribute('aria-pressed', 'true');

    const titles = await page.locator('.rider-card .reservation-card-title').allInnerTexts();
    // carla (del seed) es más antigua que el rider recién creado
    expect(titles.indexOf('carla')).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf(rider.username)).toBeGreaterThan(titles.indexOf('carla'));

    const card = applicationCard(page, rider.username);
    await expect(
      card.getByRole('button', { name: new RegExp(`^${rider.username} · `) }),
    ).toHaveAccessibleName(
      new RegExp(`^${rider.username} · ${rider.zone}\\s*Bici\\s*.+ · Pendiente de revisión$`),
    );
    await expand(card, rider.username);
    await expect(card.getByText(`Correo electrónico: ${rider.email}`)).toBeVisible();
    await expect(card.getByText('Teléfono: 612345678')).toBeVisible();
    await expect(card.getByText(`Zona de reparto: ${rider.zone}`)).toBeVisible();
    await expect(card.getByText('Vehículo: Bici')).toBeVisible();
    await expect(card.getByText('Días: Lunes, Sábado')).toBeVisible();
    await expect(card.getByText('Franjas: Mañana')).toBeVisible();
    await expect(card.getByText(/^Aceptó las condiciones el /)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Aceptar' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Rechazar' })).toBeVisible();
  });

  // Criterios 3 y 5
  test('aceptar activa la cuenta como rider y sale en «Riders activos»', async ({
    page,
    request,
  }) => {
    const rider = await newRider(request);
    await login(page, ADMIN);
    await openApplications(page);
    const card = applicationCard(page, rider.username);
    await expand(card, rider.username);
    const acceptedNotice = page.getByRole('status').filter({ hasText: 'Has aceptado' });
    await clickUntil(card.getByRole('button', { name: 'Aceptar' }), acceptedNotice);
    await expect(acceptedNotice).toHaveText(
      `Has aceptado a ${rider.username}: ya puede hacer entregas.`,
    );
    await expect(applicationCard(page, rider.username)).toHaveCount(0);

    await filter(page, 'Aceptadas').click();
    const accepted = applicationCard(page, rider.username);
    await expect(accepted).toContainText('Aceptada');
    await expand(accepted, rider.username);
    await expect(accepted.getByText(/^Aceptada el .+ por admin$/)).toBeVisible();

    const signIn = await request.post(`${API_URL}/auth/login`, { data: rider });
    expect((await signIn.json()).user.riderStatus).toBe('approved');

    await page
      .getByRole('navigation', { name: 'Administración' })
      .getByRole('link', { name: 'Riders activos' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Riders activos' })).toBeVisible();
    const table = page.getByRole('table', { name: 'Riders activos' });
    await expect(table.getByRole('row').filter({ hasText: rider.username })).toContainText(
      rider.zone,
    );
    await expect(table.getByRole('row').filter({ hasText: 'dani' })).toBeVisible();
  });

  // Criterio 3: rechazar con un motivo que ve la persona
  test('rechazar con motivo deja la cuenta rechazada y la persona ve el motivo', async ({
    page,
    request,
  }) => {
    const rider = await newRider(request);
    const reason = `No repartimos en ${rider.zone}.`;
    await login(page, ADMIN);
    await openApplications(page);
    const card = applicationCard(page, rider.username);
    await expand(card, rider.username);
    const reasonField = card.getByLabel('Motivo del rechazo (opcional)');
    await clickUntil(card.getByRole('button', { name: 'Rechazar', exact: true }), reasonField);
    await reasonField.fill(reason);
    const rejectedNotice = page.getByRole('status').filter({ hasText: 'Has rechazado' });
    await clickUntil(card.getByRole('button', { name: 'Rechazar solicitud' }), rejectedNotice);
    await expect(rejectedNotice).toHaveText(`Has rechazado la solicitud de ${rider.username}.`);
    await filter(page, 'Rechazadas').click();
    const rejected = applicationCard(page, rider.username);
    await expand(rejected, rider.username);
    await expect(rejected.getByText(`Motivo: ${reason}`)).toBeVisible();
    await expect(rejected.getByText(/^Rechazada el .+ por admin$/)).toBeVisible();

    // La persona lo ve al entrar
    await login(page, rider);
    await expect(page.getByRole('heading', { name: 'Tu solicitud para ser rider' })).toBeVisible();
    await expect(page.getByText('Solicitud rechazada')).toBeVisible();
    await expect(page.getByText(`Motivo: ${reason}`)).toBeVisible();
  });

  // Criterio 3 con el seed: eva, rechazada con motivo (CP-RID-12 de US-10.03)
  test('eva, rechazada en el seed, ve el motivo al entrar', async ({ page }) => {
    await login(page, EVA);
    await expect(page.getByText('Solicitud rechazada')).toBeVisible();
    await expect(page.getByText(`Motivo: ${EVA_REASON}`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Trabajos' })).toHaveCount(0);
  });

  // Criterio 4
  test('una solicitud ya revisada no se puede volver a resolver', async ({ page, request }) => {
    const rider = await newRider(request);
    await login(page, ADMIN);
    await openApplications(page);
    const card = applicationCard(page, rider.username);
    await expand(card, rider.username);

    // Otro admin la acepta mientras tanto (por la API)
    const { id } = await applicationOf(request, rider.username);
    const admin = auth(await apiToken(request, ADMIN));
    const first = await request.post(`${API_URL}/admin/riders/${id}/aceptar`, { headers: admin });
    expect(first.status()).toBe(200);

    await clickUntil(
      card.getByRole('button', { name: 'Aceptar' }),
      page.getByRole('alert').filter({ hasText: ALREADY_REVIEWED }),
    );
    await expect(applicationCard(page, rider.username)).toHaveCount(0);

    for (const action of ['aceptar', 'rechazar']) {
      const again = await request.post(`${API_URL}/admin/riders/${id}/${action}`, {
        headers: admin,
        data: { reason: 'Ya revisada' },
      });
      expect(again.status()).toBe(409);
      expect(await again.json()).toEqual({ error: ALREADY_REVIEWED });
    }
  });

  // Criterio 6
  test('el admin retira un objeto con un motivo y el propietario lo ve en «Mis objetos»', async ({
    page,
    request,
  }) => {
    await withdrawLeftoverLamps(request);
    const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const title = `${LAMP} ${id}`;
    const details = `Las fotos no son de este objeto (${id}).`;
    // Precio alto y categoría «Otros» para no cruzarse con los filtros de filtrar-objetos.spec.ts
    const categories: { id: string; name: string }[] = await (
      await request.get(`${API_URL}/categorias`)
    ).json();
    const created = await request.post(`${API_URL}/objetos`, {
      headers: auth(await apiToken(request, ANA)),
      data: {
        title,
        description: 'Lámpara de pie para el e2e del panel de administración.',
        categoryId: categories.find((category) => category.name === 'Otros')?.id,
        dailyPrice: 95,
        neighborhood: 'Sants',
        homeDelivery: false,
        riderDelivery: false,
        pickupPointDelivery: true,
      },
    });
    expect(created.status()).toBe(201);
    const itemId: string = (await created.json()).id;

    try {
      await login(page, ADMIN);
      await page
        .getByRole('navigation', { name: 'Administración' })
        .getByRole('link', { name: 'Objetos' })
        .click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Objetos publicados' }),
      ).toBeVisible();
      await page.getByLabel('Buscar objetos').fill(title);
      await page.getByRole('button', { name: 'Buscar' }).click();
      await page.getByRole('button', { name: `Retirar ${title}` }).click();

      const dialog = page.getByRole('dialog', { name: 'Retirar anuncio' });
      await dialog.getByRole('radio', { name: /Anuncio falso o engañoso/ }).check();
      await dialog.getByLabel(/^Detalles/).fill(details);
      await dialog.getByRole('button', { name: 'Retirar anuncio' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('status')).toHaveText(`«${title}» se ha retirado de Rentit.`);
      await expect(page.getByRole('button', { name: `Retirar ${title}` })).toHaveCount(0);

      await login(page, ANA);
      await page.goto('/mis-objetos');
      await expect(
        page.getByText(
          `Rentit ha retirado este anuncio. Motivo: Anuncio falso o engañoso. ${details}`,
        ),
      ).toBeVisible();
    } finally {
      // Si algo falla antes de retirarla, la lámpara no se queda publicada
      await withdrawByApi(request, itemId);
    }
  });

  // Sin pendientes (la lista se simula vacía: carla siempre está pendiente en el seed)
  test('sin solicitudes pendientes se avisa', async ({ page }) => {
    await page.route('**/api/admin/riders', (route) =>
      route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, json: [] }),
    );
    await login(page, ADMIN);
    await openApplications(page);
    await expect(filter(page, 'Pendientes')).toHaveText('Pendientes · 0');
    await expect(page.getByText('No hay solicitudes pendientes.')).toBeVisible();
  });
});