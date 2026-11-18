// Generado con asistencia de IA (Claude) – revisado por Danyal Anwar, 18/11/2026
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * US-05.01 Elegir modo y hora de entrega (issue #66) · tests e2e de la tarea #283
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
type User = typeof ANA;

const CORTACESPED = 'Cortacésped eléctrico';
const CARRO = 'Carro de la compra plegable';
const SILLA = 'Silla de coche para bebé';
const ESCALERA = 'Escalera de aluminio de 3 peldaños';
const TALADRO = 'Taladro percutor Bosch';
const NO_DELIVERY_MODE_ERROR = 'Elige al menos un modo de entrega.';
const OWNER_ADDRESS = 'Carrer de Sant Adrià, 33, bajos';
const RIDER_ADDRESS = 'Carrer de Pallars, 120, 3º 1ª';
const usedRequestDates = new Set<string>();

function requestDate(): Date {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const earliest = new Date(now);
  earliest.setFullYear(earliest.getFullYear() + 3);
  const latest = new Date(now);
  latest.setFullYear(latest.getFullYear() + 4);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const date = new Date(
      earliest.getTime() + Math.floor(Math.random() * (latest.getTime() - earliest.getTime())),
    );
    date.setHours(12, 0, 0, 0);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!usedRequestDates.has(key)) {
      usedRequestDates.add(key);
      return date;
    }
  }
  throw new Error('No se pudo generar una fecha aleatoria única para la solicitud.');
}

function dateAfter(days: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inputDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function shortDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value.replace(/\.$/, '') ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  return `${day} ${month}. ${year}`;
}

function dateRangeLabel(date: Date, days: number): string {
  if (days === 1) return shortDate(date);
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + days - 1);
  const startParts = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);
  const endParts = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(endDate);
  const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  if (
    getPart(startParts, 'month') === getPart(endParts, 'month') &&
    getPart(startParts, 'year') === getPart(endParts, 'year')
  ) {
    const month = getPart(startParts, 'month').replace(/\.$/, '');
    return `${getPart(startParts, 'day')}–${getPart(endParts, 'day')} ${month}. ${getPart(startParts, 'year')}`;
  }
  return `${shortDate(date)}–${shortDate(endDate)}`;
}

function priceCents(text: string, pattern: RegExp): number {
  const match = pattern.exec(text);
  if (!match) throw new Error(`No se pudo leer un importe en «${text}».`);
  const amount = Number(match[1].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(amount)) throw new Error(`El importe no es válido en «${text}».`);
  return Math.round(amount * 100);
}

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function logout(page: Page) {
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/login');
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

async function searchItemPath(page: Page, title: string, query: string): Promise<string> {
  await page.goto(`/buscar?q=${encodeURIComponent(query)}`);
  const link = page.locator('.search-results').getByRole('link', { name: title, exact: true });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  if (!href || !/^\/objetos\/[0-9a-f-]{36}$/.test(href)) {
    throw new Error(`No se encontró el enlace de «${title}» en los resultados.`);
  }
  return href;
}

async function openDeliveryStep(page: Page, itemPath: string, startDate: Date) {
  await page.goto(itemPath);
  await page.getByLabel('Fecha de inicio').fill(inputDate(startDate));
  await page.getByLabel('Fecha de fin').fill(inputDate(startDate));
  await page.getByRole('button', { name: 'Solicitar alquiler' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Entrega', exact: true })).toBeVisible();
}

function reservationCard(
  page: Page,
  sectionName: 'Enviadas' | 'Recibidas',
  title: string,
  date: Date,
  days = 1,
) {
  const exactDate = dateRangeLabel(date, days).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page
    .getByRole('region', { name: sectionName })
    .locator('.reservation-card')
    .filter({ hasText: title })
    .filter({ hasText: new RegExp(`(^|[^0-9])${exactDate}($|[^0-9])`) });
}

async function fillNewItem(page: Page, title: string) {
  await page.goto('/objetos/nuevo');
  await expect(page.getByRole('heading', { level: 1, name: 'Publicar un objeto' })).toBeVisible();
  await page.getByLabel('Nombre').fill(title);
  await page.getByLabel('Descripción').fill('Objeto de prueba para los modos de entrega.');
  await page.getByLabel('Categoría').selectOption({ label: 'Herramientas y bricolaje' });
  await page.getByLabel('Precio por día (€)').fill('7,50');
  await page.getByLabel('Fianza (€)').fill('20');
  await page.getByLabel('Barrio').selectOption('Sants');
}

function uniqueTitle(): string {
  return `Objeto entrega e2e ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

test.describe('US-05.01 Elegir modo y hora de entrega', () => {
  // Criterio 1
  test('[CP-ENT-01] publicar sin modos muestra el error y no envía ningún POST', async ({
    page,
  }) => {
    await login(page, ANA);
    await fillNewItem(page, uniqueTitle());
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url());
    });

    await page.getByRole('button', { name: 'Publicar' }).click();

    await expect(page.getByText(NO_DELIVERY_MODE_ERROR, { exact: true })).toBeVisible();
    expect(posts).toHaveLength(0);
  });

  // Criterio 1
  test('[CP-ENT-02] publicar con recogida en casa y sin dirección indica el error', async ({
    page,
  }) => {
    await login(page, ANA);
    await fillNewItem(page, uniqueTitle());
    await page.getByLabel('Recoger en casa del propietario').check();

    await page.getByRole('button', { name: 'Publicar' }).click();

    await expect(
      page.getByText('El campo "dirección" no es correcto, revísalo.', { exact: true }),
    ).toBeVisible();
  });

  // Criterio 1
  test('[CP-ENT-03] publicar solo con punto de recogida no pide dirección y guarda los modos', async ({
    page,
    request,
  }) => {
    await login(page, ANA);
    const title = uniqueTitle();
    await fillNewItem(page, title);
    await page.getByLabel('Punto de recogida').check();

    await expect(page.getByLabel('Dirección')).toHaveCount(0);
    await expect(
      page.getByText('Solo punto de recogida: no hace falta tu dirección.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page).toHaveURL(/\/objetos\/[0-9a-f-]{36}$/);

    const itemId = page.url().split('/').pop();
    const response = await request.get(`${API_URL}/objetos/${itemId}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      homeDelivery: false,
      riderDelivery: false,
      pickupPointDelivery: true,
    });
  });

  // Criterio 1
  test('[CP-ENT-04] editar y desmarcar todos los modos muestra el error', async ({ page }) => {
    await login(page, ANA);
    const title = uniqueTitle();
    await fillNewItem(page, title);
    await page.getByLabel('Punto de recogida').check();
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page).toHaveURL(/\/objetos\/[0-9a-f-]{36}$/);

    await page.goto('/mis-objetos');
    const item = page.getByRole('listitem').filter({ hasText: title });
    await item.getByRole('button', { name: /Editar/ }).click();
    await page.getByLabel('Punto de recogida').uncheck();
    await page.getByRole('button', { name: /Guardar/ }).click();

    await expect(page.getByText(NO_DELIVERY_MODE_ERROR, { exact: true })).toBeVisible();
  });

  // Criterio 2
  test('[CP-ENT-05] cada objeto solo ofrece los modos de entrega que tiene configurados', async ({
    page,
  }) => {
    await login(page, ANA);
    const cortacespedPath = await searchItemPath(page, CORTACESPED, 'cortacésped');
    const carroPath = await searchItemPath(page, CARRO, 'carro');
    await logout(page);
    await login(page, BRUNO);

    await openDeliveryStep(page, cortacespedPath, requestDate());
    await expect(page.getByRole('radio', { name: 'Recoger en casa del propietario' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Entrega por rider' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Punto de recogida' })).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(1);

    await openDeliveryStep(page, carroPath, requestDate());
    await expect(page.getByRole('radio', { name: 'Punto de recogida' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Recoger en casa del propietario' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('radio', { name: 'Entrega por rider' })).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(1);
  });

  // Criterio 2
  test('[CP-ENT-06] continuar sin elegir un modo muestra el error', async ({ page }) => {
    await login(page, ANA);
    const itemPath = await searchItemPath(page, CORTACESPED, 'cortacésped');
    await logout(page);
    await login(page, BRUNO);
    await openDeliveryStep(page, itemPath, requestDate());

    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByText('Elige un modo de entrega.', { exact: true })).toBeVisible();
  });

  // Criterio 2
  test('[CP-ENT-07] la API rechaza un modo no ofrecido y acepta el modo del Cortacésped', async ({
    page,
    request,
  }) => {
    await login(page, ANA);
    const carroPath = await searchItemPath(page, CARRO, 'carro');
    const cortacespedPath = await searchItemPath(page, CORTACESPED, 'cortacésped');
    const itemId = (path: string) => path.split('/').pop() ?? '';
    const token = await apiToken(request, BRUNO);
    const date = requestDate();
    const headers = { Authorization: `Bearer ${token}` };
    const data = (id: string) => ({
      itemId: id,
      startDate: isoDate(date),
      endDate: isoDate(date),
      deliveryMode: 'home',
    });

    const unsupported = await request.post(`${API_URL}/reservas`, {
      headers,
      data: data(itemId(carroPath)),
    });
    expect(unsupported.status()).toBe(400);
    expect((await unsupported.json()).error).toBe('Este objeto no ofrece ese modo de entrega.');

    const supported = await request.post(`${API_URL}/reservas`, {
      headers,
      data: data(itemId(cortacespedPath)),
    });
    expect(supported.status()).toBe(201);
  });

  // Criterio 3
  test('[CP-ENT-08] rider valida hora, dirección y barrio, cobra la tarifa y guarda el desglose', async ({
    page,
  }) => {
    await login(page, ANA);
    const itemPath = await searchItemPath(page, SILLA, 'silla');
    await logout(page);
    await login(page, BRUNO);
    const startDate = requestDate();
    await openDeliveryStep(page, itemPath, startDate);
    await page.getByRole('radio', { name: 'Entrega por rider' }).check();

    const slot = page.getByLabel(/Hora de entrega/);
    await expect(slot.getByRole('option', { name: 'Lo antes posible' })).toBeAttached();
    const slotLabels = await slot.getByRole('option').allTextContents();
    const hasTwoHourSlot = slotLabels.some((label) => {
      const match = /^(\d{2}):(\d{2})\s*[–-]\s*(\d{2}):(\d{2})$/.exec(label.trim());
      if (!match) return false;
      const start = Number(match[1]) * 60 + Number(match[2]);
      const end = Number(match[3]) * 60 + Number(match[4]);
      return (end - start + 24 * 60) % (24 * 60) === 120;
    });
    expect(hasTwoHourSlot).toBe(true);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Elige una hora de entrega.', { exact: true })).toBeVisible();
    await expect(
      page.getByText('El campo "dirección de entrega" no es correcto, revísalo.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('El campo "barrio de entrega" no es correcto, revísalo.', { exact: true }),
    ).toBeVisible();

    await slot.selectOption({ label: 'Lo antes posible' });
    await page.getByLabel('Dirección de entrega').fill('Carrer de Prova, 1');
    await page.getByLabel('Barrio de entrega').selectOption({ label: 'Gràcia' });
    await expect(page.locator('.rental-delivery-price')).toContainText(
      /Entrega por rider:\s*[357],00\s*€/,
    );
    const priceText = await page.locator('.rental-delivery-price').innerText();
    const rentalCents = priceCents(priceText, /Importe del alquiler[^:]*:\s*([\d.,]+)\s*€/);
    const feeCents = priceCents(priceText, /Entrega por rider:\s*([\d.,]+)\s*€/);
    const totalCents = priceCents(priceText, /Total:\s*([\d.,]+)\s*€/);
    expect([300, 500, 700]).toContain(feeCents);
    expect(totalCents).toBe(rentalCents + feeCents);
    await page.getByRole('button', { name: 'Continuar' }).click();

    const panel = page.getByRole('complementary', { name: 'Alquiler de este objeto' });
    await expect(panel.getByRole('heading', { level: 2, name: 'Revisa tu solicitud' })).toBeVisible();
    expect(priceCents(await panel.locator('.rental-total').innerText(), /([\d.,]+)\s*€/)).toBe(
      totalCents,
    );
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page).toHaveURL('/mis-solicitudes');

    const card = reservationCard(page, 'Enviadas', SILLA, startDate);
    await card.getByRole('button').click();
    const detail = card.locator('.reservation-card-detail');
    const deliveryLine = detail.getByText(
      /^Entrega por rider · Lo antes posible · ([\d.,]+)\s*€$/,
    );
    await expect(deliveryLine).toBeVisible();
    expect(priceCents(await deliveryLine.innerText(), /([\d.,]+)\s*€/)).toBe(feeCents);
    const amountLine = detail.getByText(/^Alquiler:/);
    await expect(
      amountLine,
    ).toHaveText(/^Alquiler:\s*[\d.,]+\s*€ · Entrega:\s*[\d.,]+\s*€ · Total:\s*[\d.,]+\s*€$/);
    const cardAmounts = await amountLine.innerText();
    expect(priceCents(cardAmounts, /Alquiler:\s*([\d.,]+)\s*€/)).toBe(rentalCents);
    expect(priceCents(cardAmounts, /Entrega:\s*([\d.,]+)\s*€/)).toBe(feeCents);
    expect(priceCents(cardAmounts, /Total:\s*([\d.,]+)\s*€/)).toBe(totalCents);
  });

  // Criterio 4
  test('[CP-ENT-09] la dirección del propietario solo se muestra al aceptar la recogida en casa', async ({
    page,
    request,
  }) => {
    await login(page, BRUNO);
    await page.goto(`/buscar?q=${encodeURIComponent('cortacésped')}`);
    await page.locator('.search-results').getByRole('link', { name: CORTACESPED }).click();
    const itemPath = new URL(page.url()).pathname;
    const startDate = requestDate();
    await openDeliveryStep(page, itemPath, startDate);
    await page.getByRole('radio', { name: 'Recoger en casa del propietario' }).check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page).toHaveURL('/mis-solicitudes');

    const pending = reservationCard(page, 'Enviadas', CORTACESPED, startDate);
    await pending.getByRole('button').click();
    const pendingDetail = pending.locator('.reservation-card-detail');
    await expect(
      pendingDetail.getByText('La dirección se mostrará cuando acepten la solicitud.', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(pendingDetail).not.toContainText(OWNER_ADDRESS);

    const acceptedDate = dateAfter(14);
    const accepted = reservationCard(page, 'Enviadas', ESCALERA, acceptedDate, 2);
    await accepted.getByRole('button').click();
    await expect(accepted.locator('.reservation-card-detail')).toContainText(
      "Carrer de l'Or, 18, 3º 2ª",
    );

    const itemId = itemPath.split('/').pop();
    const itemResponse = await request.get(`${API_URL}/objetos/${itemId}`);
    expect(itemResponse.status()).toBe(200);
    expect(JSON.stringify(await itemResponse.json())).not.toContain(OWNER_ADDRESS);
  });

  // Criterio 5
  test('[CP-ENT-10] el punto de recogida se elige entre varios y aparece en resumen y tarjeta', async ({
    page,
  }) => {
    await login(page, ANA);
    const itemPath = await searchItemPath(page, SILLA, 'silla');
    await logout(page);
    await login(page, BRUNO);
    const startDate = requestDate();
    await openDeliveryStep(page, itemPath, startDate);
    await page.getByRole('radio', { name: 'Punto de recogida' }).check();

    const points = page.getByRole('group', { name: 'Puntos cercanos' }).getByRole('radio');
    const pointCount = await points.count();
    expect(pointCount).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Elige un punto de recogida.', { exact: true })).toBeVisible();

    const selectedPoint = points.first();
    const labelText = (await selectedPoint.locator('xpath=..').innerText()).split('\n')[0];
    const [pointName, ...addressParts] = labelText.split(' · ');
    const pointAddress = addressParts.join(' · ');
    await selectedPoint.check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    const panel = page.getByRole('complementary', { name: 'Alquiler de este objeto' });
    await expect(panel.getByText(`Punto de recogida: ${pointName}`)).toBeVisible();
    await expect(panel.getByText(pointAddress, { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page).toHaveURL('/mis-solicitudes');

    const card = reservationCard(page, 'Enviadas', SILLA, startDate);
    await card.getByRole('button').click();
    await expect(card.locator('.reservation-card-detail')).toContainText(
      `Punto de recogida: ${pointName} · ${pointAddress}`,
    );
  });

  // Criterio 6
  test('[CP-ENT-11] el propietario ve el rider, la hora y el barrio, pero no la dirección', async ({
    page,
  }) => {
    await login(page, ANA);
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Mis solicitudes' })
      .click();
    await expect(page).toHaveURL('/mis-solicitudes');

    const taladro = reservationCard(page, 'Recibidas', TALADRO, dateAfter(7), 3);
    await taladro.getByRole('button').click();
    const detail = taladro.locator('.reservation-card-detail');
    await expect(
      detail.getByText(/^Entrega por rider · 11:00\s*[–-]\s*13:00 · \d+,\d{2}\s€$/),
    ).toBeVisible();
    await expect(detail.getByText('Barrio de entrega: Poblenou', { exact: true })).toBeVisible();
    await expect(detail).not.toContainText(RIDER_ADDRESS);
  });
});
