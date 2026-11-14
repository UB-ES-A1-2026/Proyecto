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

// «AAAA-MM-DD» a N días de hoy, como espera la API
function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// «dd/mm/aaaa» a N días de hoy, como se escribe en los campos de fecha
function inDaysText(days: number): string {
  const [year, month, day] = inDays(days).split('-');
  return `${day}/${month}/${year}`;
}

function freeStart(): number {
  return 365 + Math.floor(Math.random() * 365);
}

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
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

    await fillDates(page, inDaysText(start), inDaysText(start + 2));

    await expect(page.getByLabel('Fecha de inicio')).toHaveValue(inDaysText(start));
    await expect(page.getByLabel('Fecha de fin')).toHaveValue(inDaysText(start + 2));
    await expect(page.getByLabel('Fecha de fin')).not.toHaveAttribute('aria-invalid', 'true');
  });

  // Criterio 1: las mismas fechas, eligiéndolas en el calendario
  test('se pueden elegir las fechas haciendo clic en el calendario', async ({ page }) => {
    await startRequest(page, ITEM, 'cortacésped');
    const panel = page.getByRole('complementary', {
      name: 'Alquiler de este objeto',
    });
    const monthsAhead = 12 + Math.floor(Math.random() * 12);
    const target = new Date();
    target.setDate(1);
    target.setMonth(target.getMonth() + monthsAhead);
    const monthName = target.toLocaleDateString('es-ES', { month: 'long' });
    const year = target.getFullYear();
    const monthNumber = String(target.getMonth() + 1).padStart(2, '0');

    await expect(panel.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
    for (let month = 0; month < monthsAhead; month++) {
      await panel.getByRole('button', { name: 'Mes siguiente' }).click();
    }
    await expect(panel.getByText(`${monthName} de ${year}`)).toBeVisible();

    await panel.getByRole('button', { name: `10 de ${monthName} de ${year}` }).click();
    await expect(page.getByLabel('Fecha de inicio')).toHaveValue(`10/${monthNumber}/${year}`);
    await expect(page.getByLabel('Fecha de fin')).toHaveValue('');

    await panel.getByRole('button', { name: `12 de ${monthName} de ${year}` }).click();
    await expect(page.getByLabel('Fecha de fin')).toHaveValue(`12/${monthNumber}/${year}`);
    await expect(
      panel.getByRole('button', { name: `11 de ${monthName} de ${year}` }),
    ).toHaveAttribute('aria-pressed', 'true');

    await expect(page.locator('.rental-price').first()).toHaveText(/3 días × 9,00\s€ = 27,00\s€/);
    await expect(panel.getByRole('button', { name: 'Solicitar alquiler' })).toBeEnabled();

    // Las fechas elegidas llegan al resumen
    await panel.getByRole('button', { name: 'Solicitar alquiler' }).click();
    await expect(panel.getByText(`10 de ${monthName} de ${year}`)).toBeVisible();
    await expect(panel.getByText(`12 de ${monthName} de ${year}`)).toBeVisible();
    await panel.getByRole('button', { name: 'Volver' }).click();
    await expect(page.getByLabel('Fecha de inicio')).toHaveValue(`10/${monthNumber}/${year}`);
    await expect(panel.getByText(`${monthName} de ${year}`)).toBeVisible();
  });

  // Criterio 1: el calendario no deja elegir días pasados
  test('los días pasados del calendario están desactivados', async ({ page }) => {
    await startRequest(page, ITEM, 'cortacésped');
    const today = new Date();
    const panel = page.getByRole('complementary', {
      name: 'Alquiler de este objeto',
    });
    const todayName = today.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    await expect(panel.getByRole('button', { name: todayName, exact: true })).toBeEnabled();
    if (today.getDate() > 1) {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yesterdayName = yesterday.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      await expect(panel.getByRole('button', { name: yesterdayName, exact: true })).toBeDisabled();
    }
  });

  // Criterio 1: el fin no puede ser anterior al inicio
  test('si la fecha de fin es anterior a la de inicio, sale un error y no se puede seguir', async ({
    page,
  }) => {
    await startRequest(page, ITEM, 'cortacésped');
    const start = freeStart();

    await fillDates(page, inDaysText(start), inDaysText(start - 1));

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

    await fillDates(page, inDaysText(start), inDaysText(start + 2));

    // Las dos fechas cuentan: 3 días × 9 € = 27 €
    await expect(page.locator('.rental-price').first()).toHaveText(/3 días × 9,00\s€ = 27,00\s€/);
  });

  // Criterio 3
  test('con fechas libres se puede pulsar «Solicitar alquiler» y con fechas ocupadas no', async ({
    page,
  }) => {
    await startRequest(page, ITEM, 'cortacésped');
    const start = freeStart();
    await fillDates(page, inDaysText(start), inDaysText(start + 2));
    await expect(page.getByRole('button', { name: 'Solicitar alquiler' })).toBeEnabled();

    // La escalera tiene una solicitud aceptada para dentro de 14 y 15 días
    await startRequest(page, BUSY_ITEM, 'escalera');
    await fillDates(page, inDaysText(13), inDaysText(14));

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
    await fillDates(page, inDaysText(start), inDaysText(start + 2));

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
    await fillDates(page, inDaysText(start), inDaysText(start + 2));
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
    await page.goto('/perfil');
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
      data: {
        itemId,
        startDate: inDays(start),
        endDate: inDays(start + 1),
        confirmationTokenId: 'ctoken_simulado',
      },
    });
    expect(response.status()).toBe(403);
  });
});
