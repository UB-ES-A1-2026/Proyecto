// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * US-04.01 Solicitar un alquiler (issue #60) · tests e2e de la tarea #122
 * Un test por criterio de aceptación (casos CP-SOL-01..07 de docs/testing.md §4).
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado. Objetos del seed:
 * - «Cortacésped eléctrico», de ana, 9 €/día: bruno lo solicita.
 * - «Escalera de aluminio de 3 peldaños», de ana: tiene una solicitud aceptada de bruno para
 *   dentro de 14 y 15 días (DEMO_RESERVATIONS), así que esas fechas no están disponibles.
 * Las fechas de las solicitudes nuevas son aleatorias, dentro de 1 a 2 años, para poder repetir
 * los tests sin chocar con solicitudes de ejecuciones anteriores.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
type User = typeof ANA;

const ITEM = 'Cortacésped eléctrico';
const BUSY_ITEM = 'Escalera de aluminio de 3 peldaños';

// «AAAA-MM-DD» a N días de hoy, como espera el campo de fecha
function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function freeStart(): number {
  return 365 + Math.floor(Math.random() * 365);
}

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

// Desde la búsqueda, abre la ficha del objeto: las fechas están en su panel lateral
async function startRequest(page: Page, title: string, query: string) {
  await page.goto(`/buscar?q=${encodeURIComponent(query)}`);
  await page.locator('.search-results').getByRole('link', { name: title }).click();
  await expect(page).toHaveURL(/\/objetos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Elige las fechas' })).toBeVisible();
}

async function fillDates(page: Page, start: string, end: string) {
  await page.getByLabel('Fecha de inicio').fill(start);
  await page.getByLabel('Fecha de fin').fill(end);
}

async function sentCount(request: APIRequestContext, user: User): Promise<number> {
  const login = await request.post(`${API_URL}/auth/login`, { data: user });
  const { token } = await login.json();
  const response = await request.get(`${API_URL}/usuarios/me/reservas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await response.json()).sent.length;
}

test.describe('US-04.01 Solicitar un alquiler', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, BRUNO);
  });

  // Criterio 1
  test('se pueden elegir la fecha de inicio y la de fin', async ({ page }) => {
    await startRequest(page, ITEM, 'cortacésped');
    const start = freeStart();

    await fillDates(page, inDays(start), inDays(start + 2));

    await expect(page.getByLabel('Fecha de inicio')).toHaveValue(inDays(start));
    await expect(page.getByLabel('Fecha de fin')).toHaveValue(inDays(start + 2));
    await expect(page.getByLabel('Fecha de fin')).not.toHaveAttribute('aria-invalid', 'true');
  });

  // Criterio 1: el fin no puede ser anterior al inicio
  test('si la fecha de fin es anterior a la de inicio, sale un error y no se puede seguir', async ({
    page,
  }) => {
    await startRequest(page, ITEM, 'cortacésped');
    const start = freeStart();

    await fillDates(page, inDays(start), inDays(start - 1));

    await expect(
      page.getByText('La fecha de fin no puede ser anterior a la fecha de inicio.'),
    ).toBeVisible();
    await expect(page.getByLabel('Fecha de fin')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Solicitar alquiler' })).toBeDisabled();
  });

  // Criterio 2
  test('se muestra el precio del periodo elegido', async ({ page }) => {
    await startRequest(page, ITEM, 'cortacésped');
    const start = freeStart();

    await fillDates(page, inDays(start), inDays(start + 2));

    // Las dos fechas cuentan: 3 días × 9 € = 27 €
    await expect(page.locator('.rental-price').first()).toHaveText(/3 días × 9,00\s€ = 27,00\s€/);
  });

  // Criterio 3
  test('con fechas libres se puede pulsar «Solicitar alquiler» y con fechas ocupadas no', async ({
    page,
  }) => {
    await startRequest(page, ITEM, 'cortacésped');
    const start = freeStart();
    await fillDates(page, inDays(start), inDays(start + 2));
    await expect(page.getByRole('button', { name: 'Solicitar alquiler' })).toBeEnabled();

    // La escalera tiene una solicitud aceptada para dentro de 14 y 15 días
    await startRequest(page, BUSY_ITEM, 'escalera');
    await fillDates(page, inDays(13), inDays(14));

    await expect(page.getByText('El objeto no está disponible en esas fechas.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Solicitar alquiler' })).toBeDisabled();
  });

  // Criterio 4
  test('antes de enviar se ve un resumen con el objeto, las fechas, el importe y «Confirmar»', async ({
    page,
    request,
  }) => {
    const before = await sentCount(request, BRUNO);
    await startRequest(page, ITEM, 'cortacésped');
    const start = freeStart();
    await fillDates(page, inDays(start), inDays(start + 2));

    await page.getByRole('button', { name: 'Solicitar alquiler' }).click();

    // El resumen sale en el mismo panel, sin cambiar de pantalla
    await expect(page).toHaveURL(/\/objetos\/[0-9a-f-]{36}$/);
    const panel = page.getByRole('complementary', {
      name: 'Alquiler de este objeto',
    });
    await expect(
      panel.getByRole('heading', { level: 2, name: 'Revisa tu solicitud' }),
    ).toBeVisible();
    await expect(panel.getByText(ITEM)).toBeVisible();
    await expect(panel.getByText('Desde')).toBeVisible();
    await expect(panel.getByText('Hasta')).toBeVisible();
    await expect(panel.getByText('Importe del alquiler (3 días)')).toBeVisible();
    await expect(panel.locator('.rental-total')).toHaveText(/27,00\s€/);
    await expect(panel.getByRole('button', { name: 'Volver' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Confirmar' })).toBeVisible();
    // Todavía no se ha creado nada
    expect(await sentCount(request, BRUNO)).toBe(before);
  });

  // Criterio 5
  test('al confirmar se crea la solicitud con estado «Pendiente»', async ({ page, request }) => {
    const before = await sentCount(request, BRUNO);
    await startRequest(page, ITEM, 'cortacésped');
    const start = freeStart();
    await fillDates(page, inDays(start), inDays(start + 2));
    await page.getByRole('button', { name: 'Solicitar alquiler' }).click();

    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(page).toHaveURL('/mis-solicitudes');
    await expect(
      page
        .getByRole('region', { name: 'Enviadas' })
        .getByRole('button', { name: new RegExp(`${ITEM}.*Pendiente`) })
        .first(),
    ).toBeVisible();
    expect(await sentCount(request, BRUNO)).toBe(before + 1);
  });

  // Permisos
  test('nadie puede solicitar su propio objeto', async ({ page, request }) => {
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await login(page, ANA);
    await page.goto('/buscar?q=cortacésped');
    await page.locator('.search-results').getByRole('link', { name: ITEM }).click();

    await expect(page.getByText('Este anuncio es tuyo.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Alquilar' })).toHaveCount(0);
    await expect(page.getByLabel('Fecha de inicio')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Solicitar alquiler' })).toHaveCount(0);

    // Tampoco por la API
    const itemId = page.url().split('/').pop();
    const { token } = await (await request.post(`${API_URL}/auth/login`, { data: ANA })).json();
    const start = freeStart();
    const response = await request.post(`${API_URL}/reservas`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { itemId, startDate: inDays(start), endDate: inDays(start + 1) },
    });
    expect(response.status()).toBe(403);
  });
});
