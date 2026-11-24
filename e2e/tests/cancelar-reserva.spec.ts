/**
 * US-04.05 Cancelar una reserva con penalización (issue #64) · tests e2e de la tarea #310
 * Generado con asistencia de IA (Claude) – revisado por Danyal Anwar, 22/11/2026
 *
 * Datos del seed (backend/prisma/demoData.ts, #308), que solo usa este e2e:
 * - «Silla de coche para bebé» de ana, pagada por bruno, a 4 días: 35 % de 8 € (2,80 €).
 * - «Tabla de paddle surf hinchable» de ana, pagada por bruno, a 12 días: sin compensación (30 €).
 * - «Tienda de campaña para 4 personas» de ana, ya cancelada por bruno con el 35 %.
 * - «Proyector Full HD» de bruno: solicitud pendiente de ana.
 * El tramo del 100 % (menos de 3 días) no está en el seed: el test crea por la API una reserva
 * pagada de la tabla de paddle para mañana. Los tests que cancelan cambian la BD y van en orden y
 * sin reintentos; antes de repetirlos, `npm run db:seed`. Repetir el seed puede dejar copias
 * canceladas de estas reservas con las mismas fechas, así que cada tarjeta se busca por su reserva.
 * Si una ejecución se queda a medias, mejor `npx prisma migrate reset --force` en backend/ (BD
 * limpia, como en el CI).
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
const VECINO = { email: 'vecino1@rentit.test', password: PASSWORD };
const SEAT = 'Silla de coche para bebé';
const PADDLE = 'Tabla de paddle surf hinchable';
const TENT = 'Tienda de campaña para 4 personas';
const PROJECTOR = 'Proyector Full HD';
const POPCORN = 'Máquina de palomitas';
const MOWER = 'Cortacésped eléctrico';
const PADDLE_PICKUP_POINT = 'Biblioteca Ignasi Iglésias - Can Fabra';
const ALREADY_CLOSED = 'Esta reserva ya no se puede cancelar.';

type User = { email: string; password: string };
type Section = 'Enviadas' | 'Recibidas';
type Reservation = { id: string; status: string; startDate: string; item: { title: string } };

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return (await response.json()).token;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function myReservations(request: APIRequestContext, user: User) {
  const response = await request.get(`${API_URL}/usuarios/me/reservas`, {
    headers: auth(await apiToken(request, user)),
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { sent: Reservation[]; received: Reservation[] };
}

async function findReservation(
  request: APIRequestContext,
  user: User,
  section: 'sent' | 'received',
  title: string,
  statuses: string[],
): Promise<Reservation> {
  const [reservation] = (await myReservations(request, user))[section]
    .filter((candidate) => candidate.item.title === title && statuses.includes(candidate.status))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  expect(reservation, `No está la reserva de «${title}»: falta el seed`).toBeTruthy();
  return reservation;
}

async function itemId(request: APIRequestContext, title: string): Promise<string> {
  const response = await request.get(`${API_URL}/objetos`, { params: { q: title } });
  const { items } = await response.json();
  const item = items.find((candidate: { title: string }) => candidate.title === title);
  expect(item, `No está «${title}» en el catálogo`).toBeTruthy();
  return item.id;
}

function isoInDays(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function inputDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

async function paidPaddleTomorrow(request: APIRequestContext) {
  const start = isoInDays(1);
  const bruno = auth(await apiToken(request, BRUNO));
  const { sent } = await myReservations(request, BRUNO);
  let reservation = sent.find(
    (candidate) =>
      candidate.item.title === PADDLE &&
      candidate.startDate.slice(0, 10) === start &&
      ['pending', 'paid'].includes(candidate.status),
  );
  if (!reservation) {
    const id = await itemId(request, PADDLE);
    const options = await request.get(`${API_URL}/objetos/${id}/entrega`, {
      params: { startDate: start },
    });
    const { pickupPoints } = (await options.json()) as {
      pickupPoints: { id: string; name: string }[];
    };
    const created = await request.post(`${API_URL}/reservas`, {
      headers: bruno,
      data: {
        itemId: id,
        startDate: start,
        endDate: start,
        deliveryMode: 'pickup_point',
        pickupPointId: pickupPoints.find((point) => point.name === PADDLE_PICKUP_POINT)?.id,
        confirmationTokenId: 'ctoken_simulado',
      },
    });
    expect(created.status()).toBe(201);
    reservation = (await created.json()) as Reservation;
  }
  if (reservation.status === 'pending') {
    const accepted = await request.post(`${API_URL}/reservas/${reservation.id}/aceptar`, {
      headers: auth(await apiToken(request, ANA)),
    });
    expect(accepted.status()).toBe(200);
    expect((await accepted.json()).status).toBe('paid');
  }
  return { id: reservation.id, start };
}

async function bookedDays(request: APIRequestContext, title: string): Promise<string[]> {
  const id = await itemId(request, title);
  const response = await request.get(`${API_URL}/objetos/${id}/demanda`, {
    headers: auth(await apiToken(request, VECINO)),
    params: { from: isoInDays(0), to: isoInDays(30) },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).bookedDays;
}

function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function cards(page: Page, section: Section, title: string, status: string, dates?: string) {
  let found = page
    .getByRole('region', { name: section })
    .locator('.reservation-card')
    .filter({ has: page.locator('.reservation-card-title', { hasText: exactly(title) }) })
    .filter({ has: page.locator('.reservation-card-status', { hasText: exactly(status) }) });
  if (dates) {
    found = found.filter({
      has: page.locator('.reservation-card-dates', { hasText: exactly(dates) }),
    });
  }
  return found;
}

async function openCard(
  page: Page,
  section: Section,
  title: string,
  status: string,
  dates?: string,
): Promise<Locator> {
  await page.goto('/mis-solicitudes');
  const found = cards(page, section, title, status, dates).first();
  await found.locator('.reservation-card-toggle').click();
  return found;
}

async function openPaidCard(page: Page, section: Section, id: string) {
  await page.goto('/mis-solicitudes');
  const found = page
    .getByRole('region', { name: section })
    .locator('.reservation-card')
    .filter({ has: page.locator(`a[href="/entregas/${id}"]`) });
  await found.locator('.reservation-card-toggle').click();
  await expect(found.locator('.reservation-card-status')).toHaveText('Pagada');
  const dates = (await found.locator('.reservation-card-dates').textContent()) ?? '';
  return { card: found, dates: dates.trim() };
}

function justCancelledLine(page: Page): Locator {
  return page.locator('.reservation-cancellation:focus');
}

async function openCancelDialog(reservation: Locator, button: string) {
  const dialog = reservation.page().getByRole('dialog');
  await expect(async () => {
    await reservation.getByRole('button', { name: button }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(dialog.getByText('Calculando lo que cuesta cancelar…')).toHaveCount(0);
  return dialog;
}

async function openCheckout(page: Page, id: string, start: string) {
  await page.goto(`/objetos/${id}`);
  await page.getByLabel('Fecha de inicio').fill(inputDate(start));
  await page.getByLabel('Fecha de fin').fill(inputDate(start));
  await page.getByRole('button', { name: 'Solicitar alquiler' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Entrega', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Recoger en casa del propietario' }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Confirmar y pagar' })).toBeVisible();
}

test.describe('US-04.05 Cancelar una reserva con penalización', () => {
  // Casi todos entran con dos cuentas: con `npm run dev` en un portátil pueden pasar de los 30 s
  test.describe.configure({ timeout: 60_000 });
  // Las tarjetas y la ventana se animan al aparecer: sin animaciones no se mueven al pulsarlas
  test.use({ reducedMotion: 'reduce' });

  test('el arrendatario cancela una reserva o una solicitud; el propietario no cancela una pendiente', async ({
    page,
    request,
  }) => {
    const seatId = (await findReservation(request, BRUNO, 'sent', SEAT, ['paid'])).id;
    const paddleId = (await findReservation(request, ANA, 'received', PADDLE, ['paid'])).id;
    await login(page, BRUNO);
    const { card: seat } = await openPaidCard(page, 'Enviadas', seatId);
    await expect(seat.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible();
    const pending = await openCard(page, 'Recibidas', PROJECTOR, 'Pendiente');
    await expect(pending.getByRole('button', { name: 'Rechazar' })).toBeVisible();
    await expect(pending.getByRole('button', { name: /^Cancelar/ })).toHaveCount(0);

    await login(page, ANA);
    const projector = await openCard(page, 'Enviadas', PROJECTOR, 'Pendiente');
    const dialog = await openCancelDialog(projector, 'Cancelar solicitud');
    await expect(dialog.getByRole('heading', { name: '¿Cancelar la solicitud?' })).toBeVisible();
    await expect(dialog.locator('.cancel-summary')).toHaveCount(0);
    await expect(dialog.locator('.cancel-refund')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Volver' }).click();
    await expect(dialog).toBeHidden();
    await expect(projector).toContainText('Pendiente');

    const { card: paddle } = await openPaidCard(page, 'Recibidas', paddleId);
    await expect(paddle.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible();
  });

  test('con 4 días de margen, la ventana avisa del 35 % y «Volver» no cancela', async ({
    page,
    request,
  }) => {
    const seatId = (await findReservation(request, BRUNO, 'sent', SEAT, ['paid'])).id;
    await login(page, BRUNO);
    const { card: seat } = await openPaidCard(page, 'Enviadas', seatId);
    const dialog = await openCancelDialog(seat, 'Cancelar reserva');

    await expect(dialog.getByRole('heading', { name: '¿Cancelar la reserva?' })).toBeVisible();
    await expect(dialog.locator('.cancel-item')).toContainText(SEAT);
    await expect(dialog.locator('.cancel-summary')).toHaveText(
      /^Faltan \d+ días para el inicio: compensarás a ana con el 35\s% del alquiler \(2,80\s€\) por las molestias\.$/,
    );
    await expect(dialog.locator('.cancel-refund')).toHaveText(
      'Te devolvemos 5,20 €. Recuperas la fianza entera.',
    );
    await dialog.getByRole('button', { name: 'Volver' }).click();
    await expect(dialog).toBeHidden();
    await expect(seat).toContainText('Pagada');
  });

  test('una reserva cancelada o finalizada no se cancela y solo la cancelan sus dos personas', async ({
    page,
    request,
  }) => {
    await login(page, BRUNO);
    const tent = await openCard(page, 'Enviadas', TENT, 'Cancelada');
    await expect(tent).toContainText('Cancelada');
    await expect(tent.locator('.reservation-cancellation')).toHaveText(
      /^La cancelaste tú el .+\. Compensación a ana por las molestias: 5,60\s€ \(35\s%\)\. Te hemos devuelto 10,40\s€\.$/,
    );
    await expect(tent.getByRole('button', { name: /^Cancelar/ })).toHaveCount(0);

    await login(page, ANA);
    const tentReceived = await openCard(page, 'Recibidas', TENT, 'Cancelada');
    await expect(tentReceived.locator('.reservation-cancellation')).toHaveText(
      /^La canceló bruno el .+\. Recibes 5,60\s€ \(35\s%\) como compensación por las molestias\.$/,
    );

    const bruno = auth(await apiToken(request, BRUNO));
    const tentId = (await findReservation(request, BRUNO, 'sent', TENT, ['cancelled'])).id;
    const again = await request.post(`${API_URL}/reservas/${tentId}/cancelar`, { headers: bruno });
    expect(again.status()).toBe(409);
    expect(await again.json()).toEqual({ error: ALREADY_CLOSED });

    const popcornId = (await findReservation(request, ANA, 'sent', POPCORN, ['finished'])).id;
    const finished = await request.post(`${API_URL}/reservas/${popcornId}/cancelar`, {
      headers: auth(await apiToken(request, ANA)),
    });
    expect(finished.status()).toBe(409);
    expect(await finished.json()).toEqual({ error: ALREADY_CLOSED });

    const seatId = (await findReservation(request, BRUNO, 'sent', SEAT, ['paid'])).id;
    const stranger = await request.post(`${API_URL}/reservas/${seatId}/cancelar`, {
      headers: auth(await apiToken(request, VECINO)),
    });
    expect(stranger.status()).toBe(403);
    expect(await stranger.json()).toEqual({
      error: 'Solo el arrendatario o el propietario pueden cancelar esta reserva.',
    });

    const projectorId = (await findReservation(request, BRUNO, 'received', PROJECTOR, ['pending']))
      .id;
    const ownerPending = await request.post(`${API_URL}/reservas/${projectorId}/cancelar`, {
      headers: bruno,
    });
    expect(ownerPending.status()).toBe(409);
  });

  test('al pedir un objeto con menos de 3 días de margen se avisa de la compensación', async ({
    page,
    request,
  }) => {
    const id = await itemId(request, MOWER);
    const warning = page.getByText(
      'Empieza en menos de 3 días: si cancelas una vez aceptada, compensarás al propietario con el alquiler completo por las molestias.',
    );
    await login(page, BRUNO);

    await openCheckout(page, id, isoInDays(1));
    await expect(warning).toBeVisible();

    await openCheckout(page, id, isoInDays(20));
    await expect(page.getByText(/Empieza en menos de 3 días/)).toHaveCount(0);
  });

  test.describe('cancelar de verdad', () => {
    test.describe.configure({ mode: 'serial', retries: 0, timeout: 60_000 });

    test('si la cancelación falla, se avisa y la reserva sigue igual', async ({
      page,
      request,
    }) => {
      const paddleId = (await findReservation(request, ANA, 'received', PADDLE, ['paid'])).id;
      await page.route('**/api/reservas/*/cancelar', (route) =>
        route.fulfill({
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*' },
          json: { error: 'No se ha podido cancelar. Inténtalo de nuevo.' },
        }),
      );
      await login(page, ANA);
      const { card: paddle } = await openPaidCard(page, 'Recibidas', paddleId);
      const dialog = await openCancelDialog(paddle, 'Cancelar reserva');
      await dialog.getByRole('button', { name: 'Cancelar reserva' }).click();

      await expect(dialog.getByRole('alert')).toHaveText(
        'No se ha podido cancelar. Inténtalo de nuevo.',
      );
      await dialog.getByRole('button', { name: 'Volver' }).click();
      await expect(paddle).toContainText('Pagada');
    });

    test('bruno cancela la silla: compensa a ana con el 35 % y las fechas quedan libres', async ({
      page,
      request,
    }) => {
      const seat = await findReservation(request, BRUNO, 'sent', SEAT, ['paid']);
      expect(await bookedDays(request, SEAT)).toContain(seat.startDate.slice(0, 10));

      await login(page, BRUNO);
      const { card: sent, dates } = await openPaidCard(page, 'Enviadas', seat.id);
      const dialog = await openCancelDialog(sent, 'Cancelar reserva');
      await dialog.getByRole('button', { name: 'Cancelar reserva' }).click();
      await expect(dialog).toBeHidden();

      await expect(justCancelledLine(page)).toHaveText(
        /^La cancelaste tú el .+\. Compensación a ana por las molestias: 2,80\s€ \(35\s%\)\. Te hemos devuelto 5,20\s€\.$/,
      );
      const { sent: after } = await myReservations(request, BRUNO);
      expect(after.find((candidate) => candidate.id === seat.id)?.status).toBe('cancelled');

      await page.goto(`/entregas/${seat.id}`);
      await expect(page.getByRole('status')).toHaveText(
        'Este alquiler se ha cancelado: ya no hay ninguna entrega que hacer.',
      );

      await login(page, ANA);
      const received = await openCard(page, 'Recibidas', SEAT, 'Cancelada', dates);
      await expect(received.locator('.reservation-cancellation')).toHaveText(
        /^La canceló bruno el .+\. Recibes 2,80\s€ \(35\s%\) como compensación por las molestias\.$/,
      );

      expect(await bookedDays(request, SEAT)).not.toContain(seat.startDate.slice(0, 10));
    });

    test('ana cancela como propietaria la tabla de paddle a 12 días: sin compensación', async ({
      page,
      request,
    }) => {
      const paddleId = (await findReservation(request, ANA, 'received', PADDLE, ['paid'])).id;
      await login(page, ANA);
      const { card: paddle, dates } = await openPaidCard(page, 'Recibidas', paddleId);
      const dialog = await openCancelDialog(paddle, 'Cancelar reserva');
      await expect(dialog.locator('.cancel-summary')).toHaveCount(0);
      await expect(dialog.locator('.cancel-refund')).toHaveText(
        'A bruno se le devuelve todo lo que pagó (30,00 €) y recupera su fianza.',
      );
      await dialog.getByRole('button', { name: 'Cancelar reserva' }).click();
      await expect(dialog).toBeHidden();
      await expect(justCancelledLine(page)).toHaveText(/^La cancelaste tú el .+\.$/);

      await login(page, BRUNO);
      const sent = await openCard(page, 'Enviadas', PADDLE, 'Cancelada', dates);
      await expect(sent.locator('.reservation-cancellation')).toHaveText(
        /^La canceló ana el .+\. Te hemos devuelto 30,00\s€\.$/,
      );
    });

    test('ana cancela como propietaria con menos de 3 días: el 100 % queda a su cargo', async ({
      page,
      request,
    }) => {
      const { id } = await paidPaddleTomorrow(request);

      await login(page, ANA);
      const { card: paddle, dates } = await openPaidCard(page, 'Recibidas', id);
      const dialog = await openCancelDialog(paddle, 'Cancelar reserva');
      await expect(dialog.locator('.cancel-summary')).toHaveText(
        /^(Empieza hoy|Faltan? \d+ días? para el inicio): la compensación a bruno por las molestias, el 100\s% del alquiler \(15,00\s€\), quedará registrada a tu cargo; de momento no se cobra\.$/,
      );
      await expect(dialog.locator('.cancel-refund')).toHaveText(
        'A bruno se le devuelve todo lo que pagó (15,00 €) y recupera su fianza.',
      );
      await dialog.getByRole('button', { name: 'Cancelar reserva' }).click();
      await expect(dialog).toBeHidden();
      await expect(justCancelledLine(page)).toHaveText(
        /^La cancelaste tú el .+\. A bruno se le ha devuelto todo \(15,00\s€\)\. La compensación por las molestias, 15,00\s€ \(100\s%\), queda registrada a tu cargo; de momento no se cobra\.$/,
      );
      const { sent } = await myReservations(request, BRUNO);
      expect(sent.find((candidate) => candidate.id === id)?.status).toBe('cancelled');

      await login(page, BRUNO);
      const sentCard = await openCard(page, 'Enviadas', PADDLE, 'Cancelada', dates);
      await expect(sentCard.locator('.reservation-cancellation')).toHaveText(
        /^La canceló ana el .+\. Te hemos devuelto todo lo que pagaste \(15,00\s€\)\. La compensación por las molestias, 15,00\s€ \(100\s%\), queda registrada a cargo de ana; de momento no se cobra\.$/,
      );
    });

    // Desde 1360 px, «Mis solicitudes» es lista y detalle (US-04.02): se cancela desde el detalle
    // de la elegida (S2-T50).
    test.describe('en pantallas grandes', () => {
      test.use({ viewport: { width: 1600, height: 900 } });

      test('bruno cancela desde el detalle: la fila pasa a «Cancelada» y el detalle dice cuánto', async ({
        page,
        request,
      }) => {
        const { id } = await paidPaddleTomorrow(request);

        await login(page, BRUNO);
        await page.goto('/mis-solicitudes');
        const detail = page.getByRole('region', { name: 'Solicitud elegida' });
        const deliveryLink = detail.locator(`a[href="/entregas/${id}"]`);
        const row = cards(page, 'Enviadas', PADDLE, 'Pagada');
        await expect(row.first()).toBeVisible();
        // Puede haber otra tabla de paddle pagada: se elige la de mañana por su enlace a la entrega.
        for (const candidate of await row.all()) {
          await candidate.locator('.reservation-card-toggle').click();
          if ((await deliveryLink.count()) > 0) break;
        }
        await expect(deliveryLink).toBeVisible();

        const dialog = await openCancelDialog(detail, 'Cancelar reserva');
        await expect(dialog.locator('.cancel-summary')).toContainText('100');
        await dialog.getByRole('button', { name: 'Cancelar reserva' }).click();
        await expect(dialog).toBeHidden();

        // La fila elegida es la cancelada: puede haber otras canceladas con las mismas fechas.
        await expect(
          page
            .getByRole('region', { name: 'Enviadas' })
            .locator('.reservation-card.is-selected .reservation-card-status'),
        ).toHaveText('Cancelada');
        await expect(justCancelledLine(page)).toHaveText(/^La cancelaste tú el .+\./);
        await expect(detail.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0);
        const { sent } = await myReservations(request, BRUNO);
        expect(sent.find((candidate) => candidate.id === id)?.status).toBe('cancelled');
      });
    });
  });
});
