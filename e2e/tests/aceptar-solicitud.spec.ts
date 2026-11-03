// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * US-04.03 Aceptar una solicitud (issue #62) · tests e2e de la tarea #177
 * Un test por criterio de aceptación (casos CP-ACE-01..04 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Solicitudes del seed
 * (DEMO_RESERVATIONS en backend/prisma/demoData.ts):
 * - bruno → «Taladro percutor Bosch» de ana, pendiente: la acepta el criterio 2.
 * - bruno → «Escalera de aluminio de 3 peldaños» de ana, ya aceptada (criterio 3).
 * - bruno → «Carro de la compra plegable» de ana, pendiente (permisos; la rechaza #178).
 * - ana → «Proyector Full HD» de bruno, pendiente: solo se mira (criterio 1).
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

test.describe('US-04.03 Aceptar una solicitud', () => {
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
    await expect(proyector.getByRole('button', { name: 'Aceptar' })).toBeVisible();
  });

  // Criterio 2
  test('al aceptar una solicitud pendiente pasa a «Aceptada», también para quien la pidió', async ({
    page,
  }) => {
    await login(page, ANA);
    await openMyReservations(page);
    const taladro = card(page, 'Recibidas', 'Taladro percutor Bosch');
    await taladro.getByRole('button', { name: /Taladro percutor Bosch.*Pendiente/ }).click();

    await taladro.getByRole('button', { name: 'Aceptar' }).click();

    await expect(taladro.getByText('Has aceptado la solicitud.')).toBeVisible();
    await expect(
      taladro.getByRole('button', { name: /Taladro percutor Bosch.*Aceptada/ }),
    ).toBeVisible();

    // bruno la ve aceptada en sus enviadas
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await login(page, BRUNO);
    await openMyReservations(page);
    await expect(
      card(page, 'Enviadas', 'Taladro percutor Bosch').getByRole('button', {
        name: /Taladro percutor Bosch.*Aceptada/,
      }),
    ).toBeVisible();
  });

  // Criterio 3
  test('una solicitud aceptada no se puede volver a aceptar ni rechazar', async ({
    page,
    request,
  }) => {
    await login(page, ANA);
    await openMyReservations(page);
    const escalera = card(page, 'Recibidas', 'Escalera de aluminio de 3 peldaños');
    await escalera.getByRole('button', { name: /Escalera.*Aceptada/ }).click();

    await expect(escalera.getByText('Estado: Aceptada')).toBeVisible();
    await expect(escalera.getByRole('button', { name: 'Aceptar' })).toHaveCount(0);
    await expect(escalera.getByRole('button', { name: 'Rechazar' })).toHaveCount(0);

    // Tampoco por la API: 409 y sigue aceptada
    const token = await apiToken(request, ANA);
    const headers = { Authorization: `Bearer ${token}` };
    const { id } = await receivedReservation(request, token, 'Escalera de aluminio de 3 peldaños');
    for (const action of ['aceptar', 'rechazar']) {
      const response = await request.post(`${API_URL}/reservas/${id}/${action}`, { headers });
      expect(response.status(), action).toBe(409);
    }
    expect(
      (await receivedReservation(request, token, 'Escalera de aluminio de 3 peldaños')).status,
    ).toBe('accepted');
  });

  // Permisos
  test('solo el propietario puede aceptar: quien la pidió recibe 403', async ({ request }) => {
    const anaToken = await apiToken(request, ANA);
    const { id } = await receivedReservation(request, anaToken, 'Carro de la compra plegable');
    const brunoToken = await apiToken(request, BRUNO);

    const response = await request.post(`${API_URL}/reservas/${id}/aceptar`, {
      headers: { Authorization: `Bearer ${brunoToken}` },
    });

    expect(response.status()).toBe(403);
    expect(
      (await receivedReservation(request, anaToken, 'Carro de la compra plegable')).status,
    ).toBe('pending');
  });
});
