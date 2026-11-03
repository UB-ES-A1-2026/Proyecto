// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * US-04.04 Rechazar una solicitud (issue #63) · tests e2e de la tarea #178
 * Un test por criterio de aceptación (casos CP-REC-01..04 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Solicitudes del seed
 * (DEMO_RESERVATIONS en backend/prisma/demoData.ts):
 * - bruno → «Carro de la compra plegable» de ana, pendiente: la rechaza el criterio 2.
 * - ana → «Altavoz Bluetooth JBL» de bruno, ya rechazada (criterio 3).
 * - ana → «Proyector Full HD» de bruno, pendiente: se mira y se usa para los permisos.
 * El criterio 2 cambia la BD: para repetirlo en local, vuelve a ejecutar `npm run db:seed`.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
type User = typeof ANA;

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

async function openMyReservations(page: Page) {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mis solicitudes' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mis solicitudes' })).toBeVisible();
}

// Tarjeta de una solicitud: el botón dice «<objeto> · <fechas> · <estado>» y despliega el detalle
function card(page: Page, section: 'Enviadas' | 'Recibidas', title: string) {
  return page
    .getByRole('region', { name: section })
    .locator('.reservation-card')
    .filter({ hasText: title });
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

// Busca la solicitud de un objeto entre las recibidas del usuario del token
async function receivedReservation(request: APIRequestContext, token: string, title: string) {
  const response = await request.get(`${API_URL}/usuarios/me/reservas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { received } = await response.json();
  const reservation = received.find(
    (item: { item: { title: string } }) => item.item.title === title,
  );
  expect(reservation, `solicitud recibida de «${title}»`).toBeDefined();
  return reservation as { id: string; status: string };
}

test.describe('US-04.04 Rechazar una solicitud', () => {
  // Criterio 1
  test('el propietario ve el objeto, quién lo pide, las fechas y el estado', async ({ page }) => {
    await login(page, BRUNO);
    await openMyReservations(page);

    const proyector = card(page, 'Recibidas', 'Proyector Full HD');
    await proyector.getByRole('button', { name: /Proyector Full HD/ }).click();

    await expect(proyector.getByRole('link', { name: 'Proyector Full HD' })).toBeVisible();
    await expect(proyector.getByText('Solicitada por: ana')).toBeVisible();
    await expect(proyector.getByText(/^Fechas: Del .+ al .+/)).toBeVisible();
    await expect(proyector.getByText('Estado: Pendiente')).toBeVisible();
    await expect(proyector.getByRole('button', { name: 'Rechazar' })).toBeVisible();
  });

  // Criterio 2
  test('al rechazar una solicitud pendiente pasa a «Rechazada», también para quien la pidió', async ({
    page,
  }) => {
    await login(page, ANA);
    await openMyReservations(page);
    const carro = card(page, 'Recibidas', 'Carro de la compra plegable');
    await carro.getByRole('button', { name: /Carro de la compra plegable.*Pendiente/ }).click();

    await carro.getByRole('button', { name: 'Rechazar' }).click();

    await expect(carro.getByText('Has rechazado la solicitud.')).toBeVisible();
    await expect(
      carro.getByRole('button', { name: /Carro de la compra plegable.*Rechazada/ }),
    ).toBeVisible();

    // bruno la ve rechazada en sus enviadas
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await login(page, BRUNO);
    await openMyReservations(page);
    await expect(
      card(page, 'Enviadas', 'Carro de la compra plegable').getByRole('button', {
        name: /Carro de la compra plegable.*Rechazada/,
      }),
    ).toBeVisible();
  });

  // Criterio 3
  test('una solicitud rechazada no se puede volver a aceptar ni rechazar', async ({
    page,
    request,
  }) => {
    await login(page, BRUNO);
    await openMyReservations(page);
    const altavoz = card(page, 'Recibidas', 'Altavoz Bluetooth JBL');
    await altavoz.getByRole('button', { name: /Altavoz Bluetooth JBL.*Rechazada/ }).click();

    await expect(altavoz.getByText('Estado: Rechazada')).toBeVisible();
    await expect(altavoz.getByRole('button', { name: 'Aceptar' })).toHaveCount(0);
    await expect(altavoz.getByRole('button', { name: 'Rechazar' })).toHaveCount(0);

    // Tampoco por la API: 409 y sigue rechazada
    const token = await apiToken(request, BRUNO);
    const headers = { Authorization: `Bearer ${token}` };
    const { id } = await receivedReservation(request, token, 'Altavoz Bluetooth JBL');
    for (const action of ['aceptar', 'rechazar']) {
      const response = await request.post(`${API_URL}/reservas/${id}/${action}`, { headers });
      expect(response.status(), action).toBe(409);
    }
    expect((await receivedReservation(request, token, 'Altavoz Bluetooth JBL')).status).toBe(
      'rejected',
    );
  });

  // Permisos
  test('solo el propietario puede rechazar: quien la pidió recibe 403', async ({ request }) => {
    const brunoToken = await apiToken(request, BRUNO);
    const { id } = await receivedReservation(request, brunoToken, 'Proyector Full HD');
    const anaToken = await apiToken(request, ANA);

    const response = await request.post(`${API_URL}/reservas/${id}/rechazar`, {
      headers: { Authorization: `Bearer ${anaToken}` },
    });

    expect(response.status()).toBe(403);
    expect((await receivedReservation(request, brunoToken, 'Proyector Full HD')).status).toBe(
      'pending',
    );
  });
});
