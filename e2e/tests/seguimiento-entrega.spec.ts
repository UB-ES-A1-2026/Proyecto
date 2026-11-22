/**
 * US-05.02 Seguimiento del estado de la entrega (issue #67) · tests e2e de la tarea #291
 * Generado con asistencia de IA (Claude) – revisado por Danyal Anwar, 20/11/2026
 *
 * Datos del seed (backend/prisma/demoData.ts), las tres pagadas:
 * - «Hidrolimpiadora Kärcher» de ana, alquilada por bruno, con rider: dani ya está asignado.
 * - «Cortacésped eléctrico» de ana, alquilado por bruno, en el domicilio del propietario.
 * - «Bicicleta de montaña talla M» de bruno, alquilada por ana, en punto de recogida.
 * Los tests que avanzan una entrega cambian la BD y van en orden y sin reintentos: un reintento
 * fallaría porque la entrega ya habría avanzado. Antes de repetirlos, `npm run db:seed`.
 */
import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
const DANI = { email: 'dani@rentit.test', password: PASSWORD };
const VECINO = { email: 'vecino1@rentit.test', password: PASSWORD };
const RIDER_ITEM = 'Hidrolimpiadora Kärcher';
const HOME_ITEM = 'Cortacésped eléctrico';
const PICKUP_ITEM = 'Bicicleta de montaña talla M';
const NOT_FOUND = 'No hemos encontrado esta entrega.';
const STEP_TIME = /\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/;
// Cada cambio tiene que llegar a los demás sin recargar en menos de 10 s (criterio 2)
const LIVE_TIMEOUT = 10_000;

type User = { email: string; password: string };

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

// Una página con su propia sesión, para ver la misma entrega a la vez desde otra cuenta
async function pageAs(browser: Browser, user: User) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return page;
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

// Id de la reserva del seed (es el de la entrega) entre las enviadas de quien la alquila. Otros e2e
// crean más solicitudes del mismo objeto con fechas de dentro de años: la del seed es la que
// empieza antes de todas las que ya se han pagado.
async function reservationId(request: APIRequestContext, renter: User, title: string) {
  const token = await apiToken(request, renter);
  const response = await request.get(`${API_URL}/usuarios/me/reservas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const { sent } = await response.json();
  const [reservation] = sent
    .filter(
      (candidate: { item: { title: string }; status: string }) =>
        candidate.item.title === title &&
        ['paid', 'in_progress', 'finished'].includes(candidate.status),
    )
    .sort((a: { startDate: string }, b: { startDate: string }) =>
      a.startDate.localeCompare(b.startDate),
    );
  expect(reservation, `No está la reserva pagada de «${title}»: falta el seed`).toBeTruthy();
  return reservation.id as string;
}

async function openTracking(page: Page, id: string, title: string) {
  await page.goto(`/entregas/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: `Entrega de ${title}` })).toBeVisible();
}

function steps(page: Page): Locator {
  return page.locator('.tracking-steps li');
}

function step(page: Page, label: string): Locator {
  return steps(page).filter({ hasText: label });
}

// El paso marcado como estado actual (aria-current="step")
function currentStep(page: Page): Locator {
  return page.locator('.tracking-steps li[aria-current="step"]');
}

async function deliveryCode(page: Page): Promise<string> {
  const code = (await page.locator('.tracking-code strong').innerText()).replace(/\s/g, '');
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function confirmDialog(page: Page, title: string, confirm: string) {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: confirm }).click();
  await expect(dialog).toBeHidden();
}

test.describe('US-05.02 Seguimiento de la entrega', () => {
  // Criterio 6 (y «Ver entrega» desde «Mis solicitudes»)
  test('el seguimiento es una lista de estados con su fecha y hora, sin mapa', async ({ page }) => {
    await login(page, BRUNO);
    await page.goto('/mis-solicitudes');
    const sent = page.getByRole('region', { name: 'Enviadas' });
    const card = sent.locator('.reservation-card').filter({ hasText: RIDER_ITEM });
    await card.getByRole('button', { name: new RegExp(RIDER_ITEM) }).click();
    await card.getByRole('link', { name: 'Ver entrega' }).click();

    await expect(page).toHaveURL(/\/entregas\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: `Entrega de ${RIDER_ITEM}` }),
    ).toBeVisible();
    await expect(page.getByText(/Entrega por rider · Franja 09:00–11:00/)).toBeVisible();
    await expect(steps(page)).toHaveText([/Asignada/, /Recogida/, /En camino/, /Entregada/]);
    await expect(currentStep(page)).toContainText('Asignada');
    await expect(step(page, 'Asignada')).toContainText(STEP_TIME);
    await expect(step(page, 'Recogida')).not.toContainText(STEP_TIME);
    await expect(page.getByText('Tu código de entrega:')).toBeVisible();
    // Sin mapa en el seguimiento: ni un mapa embebido ni un canvas. Solo dentro de la sección,
    // porque Stripe.js (con clave de Stripe en el .env) añade un iframe oculto a la página.
    await expect(
      page.locator('section.tracking').locator('iframe, canvas, [class*="map"]'),
    ).toHaveCount(0);
  });

  // Errores: solo las personas de la reserva y su rider
  test('otra cuenta no puede ver la entrega', async ({ page, request }) => {
    const id = await reservationId(request, BRUNO, RIDER_ITEM);

    await login(page, VECINO);
    await page.goto(`/entregas/${id}`);
    await expect(page.getByRole('alert')).toHaveText(NOT_FOUND);
    await expect(page.locator('.tracking-steps')).toHaveCount(0);

    const token = await apiToken(request, VECINO);
    const response = await request.get(`${API_URL}/entregas/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Solo las personas de esta reserva y su rider pueden ver la entrega.',
    });

    const missing = await request.get(`${API_URL}/entregas/00000000-0000-4000-8000-000000000000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(missing.status()).toBe(404);
  });

  // Criterio 1 y errores: no se salta ni se vuelve atrás, y solo el rider lo cambia
  test('la API solo deja al rider avanzar al estado siguiente', async ({ request }) => {
    const id = await reservationId(request, BRUNO, RIDER_ITEM);
    const rider = { Authorization: `Bearer ${await apiToken(request, DANI)}` };
    const renter = { Authorization: `Bearer ${await apiToken(request, BRUNO)}` };

    // Saltar de «Asignada» a «En camino»
    const skip = await request.post(`${API_URL}/entregas/${id}/estado`, {
      headers: rider,
      data: { status: 'on_the_way' },
    });
    expect(skip.status()).toBe(409);
    expect(await skip.json()).toEqual({
      error: 'La entrega no puede pasar a ese estado: los estados van en orden.',
    });

    // El arrendatario no mueve la entrega con rider, ni la marca como recibida
    const byRenter = await request.post(`${API_URL}/entregas/${id}/estado`, {
      headers: renter,
      data: { status: 'picked_up' },
    });
    expect(byRenter.status()).toBe(403);
    const received = await request.post(`${API_URL}/entregas/${id}/recibida`, { headers: renter });
    expect(received.status()).toBe(409);
    expect(await received.json()).toEqual({
      error: 'Con rider, la entrega la marca el rider con tu código.',
    });

    // Devolver antes de tenerlo
    const returned = await request.post(`${API_URL}/entregas/${id}/devuelta`, { headers: renter });
    expect(returned.status()).toBe(409);
    expect(await returned.json()).toEqual({
      error: 'Solo puedes marcar «He devuelto el objeto» con el alquiler en curso.',
    });

    const tracking = await request.get(`${API_URL}/entregas/${id}`, { headers: rider });
    expect((await tracking.json()).status).toBe('assigned');
  });

  // Los tests de aquí abajo avanzan las entregas del seed: en orden y sin reintentos
  test.describe('con rider', () => {
    test.describe.configure({ mode: 'serial', retries: 0 });

    // Criterios 1 y 2
    test('el rider avanza en orden y el arrendatario y el propietario lo ven sin recargar', async ({
      browser,
      page,
      request,
    }) => {
      const id = await reservationId(request, BRUNO, RIDER_ITEM);
      const renter = await pageAs(browser, BRUNO);
      const owner = await pageAs(browser, ANA);
      await openTracking(renter, id, RIDER_ITEM);
      await openTracking(owner, id, RIDER_ITEM);
      await expect(owner.getByText('Arrendatario: bruno')).toBeVisible();
      // El código solo lo ve el arrendatario
      await expect(owner.locator('.tracking-code')).toHaveCount(0);

      await login(page, DANI);
      await openTracking(page, id, RIDER_ITEM);
      await expect(page.locator('.tracking-code')).toHaveCount(0);

      await page.getByRole('button', { name: 'Marcar como Recogida' }).click();
      await expect(currentStep(page)).toContainText('Recogida');
      await expect(step(page, 'Recogida')).toContainText(STEP_TIME);
      for (const other of [renter, owner]) {
        await expect(currentStep(other)).toContainText('Recogida', { timeout: LIVE_TIMEOUT });
      }

      await page.getByRole('button', { name: 'Marcar como En camino' }).click();
      await expect(currentStep(page)).toContainText('En camino');
      for (const other of [renter, owner]) {
        await expect(currentStep(other)).toContainText('En camino', { timeout: LIVE_TIMEOUT });
      }
      await expect(page.getByRole('button', { name: 'Marcar como Entregada' })).toBeVisible();

      await renter.context().close();
      await owner.context().close();
    });

    // Criterio 3
    test('con un código incorrecto no se entrega; con el correcto pasa a «En curso»', async ({
      browser,
      page,
      request,
    }) => {
      const id = await reservationId(request, BRUNO, RIDER_ITEM);
      const renter = await pageAs(browser, BRUNO);
      await openTracking(renter, id, RIDER_ITEM);
      const code = await deliveryCode(renter);
      const wrongCode = `${(Number(code[0]) + 1) % 10}${code.slice(1)}`;

      await login(page, DANI);
      await openTracking(page, id, RIDER_ITEM);
      const codeField = page.getByLabel('Código de entrega');
      const submit = page.getByRole('button', { name: 'Marcar como Entregada' });

      // Sin las 6 cifras no se envía
      await codeField.fill('123');
      await submit.click();
      await expect(page.locator('#delivery-code-error')).toHaveText(
        'Escribe las 6 cifras del código de entrega.',
      );
      await expect(codeField).toHaveAttribute('aria-invalid', 'true');

      // Código incorrecto: error con los intentos que quedan y sigue «En camino»
      await codeField.fill(wrongCode);
      await submit.click();
      await expect(page.locator('#delivery-code-error')).toHaveText(
        'El código no es correcto. Te quedan 4 intentos.',
      );
      await expect(currentStep(page)).toContainText('En camino');

      // Código correcto (con el espacio con el que lo ve el arrendatario)
      await codeField.fill(`${code.slice(0, 3)} ${code.slice(3)}`);
      await submit.click();
      await expect(currentStep(page)).toContainText('En curso');
      await expect(step(page, 'Entregada')).toContainText(STEP_TIME);
      await expect(page.getByText('Alquiler: En curso')).toBeVisible();
      await expect(page.locator('.tracking-rider')).toHaveCount(0);

      // El arrendatario lo ve sin recargar y el código ya no sale
      await expect(currentStep(renter)).toContainText('En curso', { timeout: LIVE_TIMEOUT });
      await expect(renter.locator('.tracking-code')).toHaveCount(0);

      // El código es de un solo uso
      const reused = await request.post(`${API_URL}/entregas/${id}/estado`, {
        headers: { Authorization: `Bearer ${await apiToken(request, DANI)}` },
        data: { status: 'delivered', code },
      });
      expect(reused.status()).toBe(409);
      await renter.context().close();
    });

    // Criterio 5
    test('al marcar «He devuelto el objeto» el alquiler pasa a «Finalizada»', async ({
      page,
      request,
    }) => {
      const id = await reservationId(request, BRUNO, RIDER_ITEM);
      await login(page, BRUNO);
      await openTracking(page, id, RIDER_ITEM);

      await page.getByRole('button', { name: 'He devuelto el objeto' }).click();
      await confirmDialog(page, 'He devuelto el objeto', 'Sí, lo he devuelto');

      await expect(currentStep(page)).toHaveCount(0);
      await expect(step(page, 'Finalizada')).toContainText(STEP_TIME);
      await expect(page.getByText('Alquiler finalizado.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'He devuelto el objeto' })).toHaveCount(0);

      await page.goto('/mis-solicitudes');
      const card = page
        .getByRole('region', { name: 'Enviadas' })
        .locator('.reservation-card')
        .filter({ hasText: RIDER_ITEM });
      await expect(card).toContainText('Finalizada');
    });
  });

  test.describe('sin rider', () => {
    test.describe.configure({ mode: 'serial', retries: 0 });

    // Criterio 4 y errores: «He devuelto el objeto» solo con el alquiler en curso
    test('en el domicilio, «Ya tengo el objeto» lo pasa a «En curso» y después se devuelve', async ({
      page,
      request,
    }) => {
      const id = await reservationId(request, BRUNO, HOME_ITEM);
      await login(page, BRUNO);
      await openTracking(page, id, HOME_ITEM);
      await expect(page.getByText('Recoger en casa del propietario')).toBeVisible();
      await expect(steps(page)).toHaveText([/Pendiente de entrega/, /Entregada/]);
      await expect(page.getByRole('button', { name: 'He devuelto el objeto' })).toHaveCount(0);

      // «Cancelar» en la confirmación no cambia nada
      await page.getByRole('button', { name: 'Ya tengo el objeto' }).click();
      const dialog = page.getByRole('dialog', { name: 'Ya tengo el objeto' });
      await expect(dialog.getByText('¿Ya tienes el objeto? No se puede deshacer')).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(currentStep(page)).toContainText('Pendiente de entrega');

      await page.getByRole('button', { name: 'Ya tengo el objeto' }).click();
      await confirmDialog(page, 'Ya tengo el objeto', 'Sí, ya lo tengo');
      await expect(currentStep(page)).toContainText('En curso');
      await expect(page.getByText('Alquiler: En curso')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ya tengo el objeto' })).toHaveCount(0);

      await page.getByRole('button', { name: 'He devuelto el objeto' }).click();
      await confirmDialog(page, 'He devuelto el objeto', 'Sí, lo he devuelto');
      await expect(page.getByText('Alquiler finalizado.')).toBeVisible();
    });

    // Criterio 4 y 2: en punto de recogida, y el propietario lo ve sin recargar
    test('en punto de recogida, el propietario ve «En curso» sin recargar', async ({
      browser,
      page,
      request,
    }) => {
      const id = await reservationId(request, ANA, PICKUP_ITEM);
      const owner = await pageAs(browser, BRUNO);
      await openTracking(owner, id, PICKUP_ITEM);
      await expect(currentStep(owner)).toContainText('Pendiente de entrega');
      await expect(owner.getByRole('button', { name: 'Ya tengo el objeto' })).toHaveCount(0);

      await login(page, ANA);
      await openTracking(page, id, PICKUP_ITEM);
      await expect(page.getByText(/Punto de recogida/)).toBeVisible();
      await page.getByRole('button', { name: 'Ya tengo el objeto' }).click();
      await confirmDialog(page, 'Ya tengo el objeto', 'Sí, ya lo tengo');
      await expect(currentStep(page)).toContainText('En curso');

      await expect(currentStep(owner)).toContainText('En curso', { timeout: LIVE_TIMEOUT });
      await owner.context().close();
    });
  });
});