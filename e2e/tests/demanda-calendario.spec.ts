// US-04.07 Ver la demanda de cada fecha en el calendario (issue #303) · tests e2e de la tarea #313
// Generado con asistencia de IA (Claude) – revisado por Danyal Anwar, 17/11/2026
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
const NEIGHBOR1 = { email: 'vecino1@rentit.test', password: PASSWORD };
type User = typeof ANA;

const BICYCLE = 'Bicicleta de montaña talla M';
const BUSY_ITEM = 'Escalera de aluminio de 3 peldaños';
const dayFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, month, 1)),
  ),
);

function dateInDays(days: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  )
    .toISOString()
    .slice(0, 10);
}

function dayLabel(days: number): string {
  return dayFormatter.format(new Date(`${dateInDays(days)}T00:00:00.000Z`));
}

function inputDate(days: number): string {
  const [year, month, day] = dateInDays(days).split('-');
  return `${day}/${month}/${year}`;
}

function dayButton(panel: Locator, days: number): Locator {
  return panel.getByRole('button', { name: new RegExp(`^${dayLabel(days)}(,|$)`) });
}

function monthOrdinal(label: string): number {
  const parts = label.split(' de ');
  const monthIndex = monthNames.indexOf(parts[0]);
  if (parts.length !== 2 || monthIndex < 0) {
    throw new Error(`El mes del calendario no tiene el formato esperado: ${label}`);
  }
  return Number(parts[1]) * 12 + monthIndex;
}

async function showMonthForDate(panel: Locator, days: number) {
  const monthHeading = panel.locator('.calendar-month');
  const targetMonth = monthFormatter.format(new Date(`${dateInDays(days).slice(0, 7)}-01T00:00:00.000Z`));
  const targetOrdinal = monthOrdinal(targetMonth);

  for (let attempt = 0; attempt < 24; attempt++) {
    const currentMonth = (await monthHeading.textContent())?.trim();
    if (!currentMonth) throw new Error('No se ha encontrado el mes visible del calendario.');
    const currentOrdinal = monthOrdinal(currentMonth);
    if (currentOrdinal === targetOrdinal) return;

    const direction = currentOrdinal < targetOrdinal ? 'Mes siguiente' : 'Mes anterior';
    await panel.getByRole('button', { name: direction }).click();
    await expect(monthHeading).not.toHaveText(currentMonth);
  }

  throw new Error(`No se ha podido mostrar el mes ${targetMonth}.`);
}

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function openItem(page: Page, title: string, query: string) {
  await page.goto(`/buscar?q=${encodeURIComponent(query)}`);
  await page.locator('.search-results').getByRole('link', { name: title }).click();
  await expect(page).toHaveURL(/\/objetos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

async function fillDates(page: Page, start: string, end: string) {
  await page.getByLabel('Fecha de inicio').fill(start);
  await page.getByLabel('Fecha de fin').fill(end);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test.describe('US-04.07 Ver la demanda de cada fecha en el calendario', () => {
  // Los días cambian de fondo con una transición (calendar.css): sin animaciones, el color que se lee
  // es el definitivo y no uno a medio cambiar (bug #383).
  test.use({ reducedMotion: 'reduce' });

  // Criterio 1
  test('colorea los días y anuncia su demanda accesible', async ({ page }) => {
    await login(page, ANA);
    await openItem(page, BICYCLE, 'bicicleta');
    const panel = page.getByRole('complementary', { name: 'Alquiler de este objeto' });
    const cases = [
      { offset: 10, level: 'has-demand-3', count: '6 solicitudes para este día' },
      { offset: 11, level: 'has-demand-2', count: '4 solicitudes para este día' },
      { offset: 8, level: 'has-demand-1', count: '1 solicitud para este día' },
      { offset: 13, level: null, count: null },
    ];
    const colors: string[] = [];

    for (const { offset, level, count } of cases) {
      await showMonthForDate(panel, offset);
      const day = dayButton(panel, offset);
      await expect(day).toHaveAttribute(
        'aria-label',
        count ? `${dayLabel(offset)}, ${count}` : dayLabel(offset),
      );
      if (level) {
        await expect(day).toHaveClass(new RegExp(`\\b${level}\\b`));
      } else {
        await expect(day).not.toHaveClass(/has-demand-/);
      }
      colors.push(await day.evaluate((element) => getComputedStyle(element).backgroundColor));
    }

    expect(new Set(colors).size).toBe(4);
  });

  // Criterio 2
  test('muestra la leyenda completa en el orden de los niveles', async ({ page }) => {
    await login(page, ANA);
    await openItem(page, BICYCLE, 'bicicleta');
    const legend = page
      .getByRole('complementary', { name: 'Alquiler de este objeto' })
      .getByRole('list', { name: 'Leyenda de la demanda' });

    await expect(legend.getByRole('listitem')).toHaveText([
      'Libre',
      'Poca demanda (1–2)',
      'Demanda media (3–5)',
      'Mucha demanda (6 o más)',
      'Reservado',
    ]);
  });

  // Criterio 3
  test('al señalar o elegir un día se informa de su demanda y se rellena la fecha', async ({
    page,
  }) => {
    await login(page, ANA);
    await openItem(page, BICYCLE, 'bicicleta');
    const panel = page.getByRole('complementary', { name: 'Alquiler de este objeto' });
    const demandText = panel.locator('.calendar-day-demand');

    await showMonthForDate(panel, 10);
    await dayButton(panel, 10).hover();
    await expect(demandText).toHaveText(`${dayLabel(10)}: 6 solicitudes para este día`);

    await showMonthForDate(panel, 8);
    await dayButton(panel, 8).hover();
    await expect(demandText).toHaveText(`${dayLabel(8)}: 1 solicitud para este día`);

    await showMonthForDate(panel, 13);
    await dayButton(panel, 13).click();
    await expect(demandText).toHaveText(`${dayLabel(13)}: Ninguna solicitud para este día`);
    await expect(page.getByLabel('Fecha de inicio')).toHaveValue(inputDate(13));
  });

  // Criterio 4
  test('cuenta una vez cada solicitud que coincide y no avisa cuando no hay ninguna', async ({
    page,
  }) => {
    await login(page, ANA);
    await openItem(page, BICYCLE, 'bicicleta');
    const panel = page.getByRole('complementary', { name: 'Alquiler de este objeto' });
    const warning = panel.getByRole('status').filter({ hasText: 'solicitud que coincide' });

    await fillDates(page, inputDate(10), inputDate(11));
    await expect(
      panel.getByText('Hay 6 solicitudes que coinciden con tus fechas. Es posible que no te acepten.'),
    ).toBeVisible();

    await fillDates(page, inputDate(8), inputDate(8));
    await expect(
      panel.getByText('Hay 1 solicitud que coincide con tus fechas. Es posible que no te acepten.'),
    ).toBeVisible();

    await fillDates(page, inputDate(13), inputDate(13));
    await expect(warning).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Solicitar alquiler' })).toBeEnabled();
  });

  // Criterio 5
  test('no revela quién hizo las solicitudes ni identificadores personales en la API', async ({
    page,
    request,
  }) => {
    await login(page, ANA);
    await openItem(page, BICYCLE, 'bicicleta');
    await expect(page.locator('body')).not.toContainText(/vecino/i);

    const itemId = page.url().split('/').pop();
    if (!itemId) throw new Error('No se ha encontrado el identificador del objeto.');
    const loginResponse = await request.post(`${API_URL}/auth/login`, { data: ANA });
    expect(loginResponse.ok()).toBeTruthy();
    const loginBody: unknown = await loginResponse.json();
    if (!isRecord(loginBody) || typeof loginBody.token !== 'string') {
      throw new Error('La respuesta de inicio de sesión no contiene un token.');
    }

    const response = await request.get(
      `${API_URL}/objetos/${itemId}/demanda?from=${dateInDays(8)}&to=${dateInDays(12)}`,
      { headers: { Authorization: `Bearer ${loginBody.token}` } },
    );
    expect(response.ok()).toBeTruthy();
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error('La respuesta de demanda no es un objeto.');

    expect(Object.keys(body).sort()).toEqual(['bookedDays', 'days', 'pendingRequests']);
    expect(body.pendingRequests).toBe(6);
    expect(Array.isArray(body.days)).toBe(true);
    if (!Array.isArray(body.days)) throw new Error('La lista de días de demanda no es válida.');
    for (const day of body.days) {
      if (!isRecord(day)) throw new Error('Un día de demanda no es un objeto.');
      expect(Object.keys(day).sort()).toEqual(['date', 'pendingRequests']);
    }
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/[^\s"<>]+@[^\s"<>]+\.[^\s"<>]+/);
    expect(serialized).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  });

  // Propias: las solicitudes del usuario conectado no se cuentan.
  test('excluye las solicitudes propias del nivel y del aria-label', async ({ page }) => {
    await login(page, NEIGHBOR1);
    await openItem(page, BICYCLE, 'bicicleta');
    const panel = page.getByRole('complementary', { name: 'Alquiler de este objeto' });

    await showMonthForDate(panel, 10);
    await expect(dayButton(panel, 10)).toHaveClass(/\bhas-demand-2\b/);
    await expect(dayButton(panel, 10)).toHaveAttribute(
      'aria-label',
      `${dayLabel(10)}, 5 solicitudes para este día`,
    );

    await showMonthForDate(panel, 8);
    await expect(dayButton(panel, 8)).not.toHaveClass(/has-demand-/);
    await expect(dayButton(panel, 8)).toHaveAttribute('aria-label', dayLabel(8));
  });

  // Error de carga
  test('si falla la demanda, muestra el error pero el calendario sigue permitiendo elegir fechas', async ({
    page,
  }) => {
    await login(page, ANA);
    await page.route('**/api/objetos/*/demanda**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Error interno.' }),
      }),
    );
    await openItem(page, BICYCLE, 'bicicleta');
    const panel = page.getByRole('complementary', { name: 'Alquiler de este objeto' });

    await expect(page.getByText('No se ha podido cargar la demanda de las fechas.')).toBeVisible();
    await expect(panel.getByRole('list', { name: 'Leyenda de la demanda' })).toHaveCount(0);
    await expect(panel.locator('.calendar-day[class*="has-demand-"]')).toHaveCount(0);

    await showMonthForDate(panel, 13);
    await dayButton(panel, 13).click();
    await expect(page.getByLabel('Fecha de inicio')).toHaveValue(inputDate(13));
  });

  // Días reservados
  test('marca los días reservados como ocupados y desactivados', async ({ page }) => {
    await login(page, BRUNO);
    await openItem(page, BUSY_ITEM, 'escalera');
    const panel = page.getByRole('complementary', { name: 'Alquiler de este objeto' });

    await showMonthForDate(panel, 14);
    for (const offset of [14, 15]) {
      await showMonthForDate(panel, offset);
      const day = dayButton(panel, offset);
      await expect(day).toHaveAttribute('aria-label', `${dayLabel(offset)}, Reservado`);
      await expect(day).toHaveClass(/\bis-booked\b/);
      await expect(day).toBeDisabled();
    }
    await showMonthForDate(panel, 13);
    await expect(dayButton(panel, 13)).toBeEnabled();
  });

  // Permisos de propietario
  test('el propietario ve el aviso sin calendario ni leyenda', async ({ page }) => {
    await login(page, BRUNO);
    await openItem(page, BICYCLE, 'bicicleta');

    await expect(page.getByText('Este anuncio es tuyo.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Calendario' })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Leyenda de la demanda' })).toHaveCount(0);
  });
});
