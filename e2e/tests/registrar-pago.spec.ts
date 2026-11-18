/**
 * US-07.01 Registrar un pago (issue #72) · tests e2e de la tarea #287
 */
// Generado con asistencia de IA (Claude) – revisado por Danyal Anwar, 18/11/2026
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
const ITEM = 'Cortacésped eléctrico';

type User = typeof ANA;
type ReservationRecord = { id: string; startDate: string; status: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function dateInDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function randomStartDate(): string {
  const days = 3 * 365 + Math.floor(Math.random() * 365);
  return dateInDays(days);
}

function dateAfter(startDate: string, days: number): string {
  return new Date(new Date(startDate).getTime() + days * 86400000).toISOString().slice(0, 10);
}

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function getToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.ok()).toBeTruthy();
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.token !== 'string') {
    throw new Error('La API no devolvió el token de sesión esperado.');
  }
  return body.token;
}

async function getItemId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API_URL}/objetos?q=${encodeURIComponent('cortacésped')}`);
  expect(response.ok()).toBeTruthy();
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new Error('La API no devolvió la lista de objetos esperada.');
  }
  const item = body.items.find(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && entry.title === ITEM && typeof entry.id === 'string',
  );
  if (!item || typeof item.id !== 'string') {
    throw new Error(`No se encontró el objeto «${ITEM}».`);
  }
  return item.id;
}

async function getSentReservations(
  request: APIRequestContext,
  user: User,
): Promise<ReservationRecord[]> {
  const token = await getToken(request, user);
  const response = await request.get(`${API_URL}/usuarios/me/reservas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.sent)) {
    throw new Error('La API no devolvió las solicitudes enviadas esperadas.');
  }
  return body.sent.filter(
    (entry): entry is ReservationRecord =>
      isRecord(entry) &&
      typeof entry.id === 'string' &&
      typeof entry.startDate === 'string' &&
      typeof entry.status === 'string',
  );
}

async function findReservation(
  request: APIRequestContext,
  user: User,
  startDate: string,
): Promise<ReservationRecord | undefined> {
  const reservations = await getSentReservations(request, user);
  return reservations.find((reservation) => reservation.startDate.slice(0, 10) === startDate);
}

async function openCheckout(
  page: Page,
  request: APIRequestContext,
  startDate: string,
  days: number,
) {
  const itemId = await getItemId(request);
  await page.goto(
    `/objetos/${itemId}/solicitar?inicio=${startDate}&fin=${dateAfter(startDate, days)}`,
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Confirmar y pagar' })).toBeVisible();
}

async function fillCard(page: Page, number: string, expiry = '12/30', cvc = '123') {
  await page.getByLabel('Número de tarjeta').fill(number);
  await page.getByLabel('Caducidad').fill(expiry);
  await page.getByLabel('CVC').fill(cvc);
}

async function acceptReservation(
  request: APIRequestContext,
  reservationId: string,
): Promise<number> {
  const token = await getToken(request, ANA);
  const response = await request.post(`${API_URL}/reservas/${reservationId}/aceptar`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.status();
}

test.describe('US-07.01 Registrar un pago', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, BRUNO);
  });

  // Criterio 2 y 3
  test('muestra el resumen de 3 días y explica el bloqueo del importe y la fianza', async ({
    page,
    request,
  }) => {
    const startDate = randomStartDate();
    await openCheckout(page, request, startDate, 2);

    const summary = page.getByRole('region', { name: 'Tu solicitud' });
    await expect(summary.getByText(ITEM)).toBeVisible();
    await expect(summary.getByText('Desde')).toBeVisible();
    await expect(summary.getByText('Hasta')).toBeVisible();
    await expect(summary.locator('.rental-total')).toHaveText(/27,00\s€/);
    await expect(summary.getByText('Fianza (se retiene, no se cobra)')).toBeVisible();
    await expect(summary.locator('.checkout-deposit')).toHaveText(/Total con fianza\s*87,00\s€/);

    await expect(page.getByText(/Bloquearemos 27,00\s€ en tu tarjeta/)).toBeVisible();
    await expect(page.getByText('Solo se cobran si ana acepta')).toBeVisible();
    const testCards = page.locator('.payment-test-cards');
    await expect(testCards).toContainText('Modo de prueba: no se mueve dinero real.');
    await expect(testCards).toContainText('4242 4242 4242 4242 se acepta');
    await expect(testCards).toContainText('4000 0000 0000 0002 se rechaza');
  });

  // Criterio 5
  test('una tarjeta rechazada muestra el error y no crea la solicitud', async ({
    page,
    request,
  }) => {
    const startDate = randomStartDate();
    await openCheckout(page, request, startDate, 0);
    await fillCard(page, '4000 0000 0000 0002');
    await page.getByRole('button', { name: 'Confirmar y enviar solicitud' }).click();

    await expect(page.getByRole('alert')).toHaveText('Tu tarjeta ha sido rechazada.');
    await expect(page).toHaveURL(/\/solicitar\?/);
    await expect(page.getByRole('button', { name: 'Confirmar y enviar solicitud' })).toBeEnabled();
    expect(await findReservation(request, BRUNO, startDate)).toBeUndefined();
  });

  // Criterio 5: validación
  test('valida los tres campos antes de enviar y no crea la solicitud', async ({
    page,
    request,
  }) => {
    const startDate = randomStartDate();
    const reservationPosts: string[] = [];
    page.on('request', (pageRequest) => {
      if (pageRequest.method() === 'POST' && pageRequest.url().endsWith('/api/reservas')) {
        reservationPosts.push(pageRequest.postData() ?? '');
      }
    });
    await openCheckout(page, request, startDate, 0);
    await fillCard(page, '1234 5678 9012 3456', '01/20', '12');
    await page.getByRole('button', { name: 'Confirmar y enviar solicitud' }).click();

    await expect(page.getByLabel('Número de tarjeta')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Caducidad')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('CVC')).toHaveAttribute('aria-invalid', 'true');
    expect(reservationPosts).toHaveLength(0);
    expect(await findReservation(request, BRUNO, startDate)).toBeUndefined();
  });

  // Criterio 1 y 4
  test('envía solo el token de pago y la solicitud pasa de pendiente a pagada', async ({
    page,
    request,
  }) => {
    const startDate = randomStartDate();
    const postBodies: string[] = [];
    page.on('request', (pageRequest) => {
      if (pageRequest.method() === 'POST' && pageRequest.url().includes('/api/')) {
        postBodies.push(pageRequest.postData() ?? '');
      }
    });
    await openCheckout(page, request, startDate, 2);
    await fillCard(page, '4242 4242 4242 4242');
    await page.getByRole('button', { name: 'Confirmar y enviar solicitud' }).click();

    await expect(page).toHaveURL('/mis-solicitudes');
    await expect(
      page.getByText('Solicitud enviada. Hemos bloqueado el importe hasta que ana responda.'),
    ).toBeVisible();
    expect(postBodies.join('\n')).not.toMatch(/4242\s?4242/);

    const reservation = await findReservation(request, BRUNO, startDate);
    expect(reservation).toBeDefined();
    if (!reservation) throw new Error('No se encontró la solicitud creada.');
    expect(reservation.status).toBe('pending');

    expect(await acceptReservation(request, reservation.id)).toBe(200);
    expect((await findReservation(request, BRUNO, startDate))?.status).toBe('paid');
  });

  // Criterio 8
  test('no permite aceptar dos veces una solicitud pagada', async ({ page, request }) => {
    const startDate = randomStartDate();
    await openCheckout(page, request, startDate, 0);
    await fillCard(page, '4242 4242 4242 4242');
    await page.getByRole('button', { name: 'Confirmar y enviar solicitud' }).click();
    await expect(page).toHaveURL('/mis-solicitudes');

    const reservation = await findReservation(request, BRUNO, startDate);
    expect(reservation).toBeDefined();
    if (!reservation) throw new Error('No se encontró la solicitud creada.');
    expect(await acceptReservation(request, reservation.id)).toBe(200);

    const token = await getToken(request, ANA);
    const duplicate = await request.post(`${API_URL}/reservas/${reservation.id}/aceptar`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(duplicate.status()).toBe(409);
    const body: unknown = await duplicate.json();
    expect(body).toEqual({ error: 'Esta solicitud ya no está pendiente.' });
    expect((await findReservation(request, BRUNO, startDate))?.status).toBe('paid');
  });
});
