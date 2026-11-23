// Generado con asistencia de IA (Claude) – revisado por Danyal Anwar, 18/11/2026
/**
 * US-08.01 Valorar un alquiler (issue #74) · tests e2e de la tarea #297
 * US-08.02 Valorar un usuario (issue #75): el propietario valora al inquilino (#298 y #299)
 * Necesita el frontend y el backend en marcha y `npm run db:seed` ejecutado.
 * Los dos últimos tests publican una valoración: en local, vuelve a ejecutar `npm run db:seed`
 * antes de repetirlo.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Rentit2026';
const ANA = { email: 'ana@rentit.test', password: PASSWORD };
const BRUNO = { email: 'bruno@rentit.test', password: PASSWORD };
const DANI = { email: 'dani@rentit.test', password: PASSWORD };
type User = typeof ANA;

type Reservation = {
  id: string;
  status: string;
  item: { title: string };
  myRating?: { score: number; comment: string | null } | null;
};

async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
}

async function openMyReservations(page: Page) {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mis solicitudes' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mis solicitudes' })).toBeVisible();
}

function card(page: Page, section: 'Enviadas' | 'Recibidas', title: string) {
  return page
    .getByRole('region', { name: section })
    .locator('.reservation-card')
    .filter({ hasText: title });
}

async function apiToken(request: APIRequestContext, user: User): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: user });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { token: string }).token;
}

async function sentReservation(
  request: APIRequestContext,
  token: string,
  title: string,
): Promise<Reservation> {
  const response = await request.get(`${API_URL}/usuarios/me/reservas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const { sent } = (await response.json()) as { sent: Reservation[] };
  const reservation = sent.find((item) => item.item.title === title);
  expect(reservation, `solicitud enviada de «${title}»`).toBeDefined();
  return reservation as Reservation;
}

test.describe('US-08.01 Valorar un alquiler', () => {
  // Criterio 1, Criterio 2 y Criterio 3
  test('ana abre el formulario, elige estrellas y puede cancelar sin publicar', async ({
    page,
    request,
  }) => {
    await login(page, ANA);
    await openMyReservations(page);

    const popcorn = card(page, 'Enviadas', 'Máquina de palomitas');
    await popcorn.getByRole('button', { name: /Máquina de palomitas/ }).click();
    const ratingLink = popcorn.getByRole('link', {
      name: 'Valorar el alquiler de Máquina de palomitas',
    });
    await expect(ratingLink).toBeVisible();
    await ratingLink.click();

    const token = await apiToken(request, ANA);
    const reservation = await sentReservation(request, token, 'Máquina de palomitas');
    await expect(page).toHaveURL(
      new RegExp(`/mis-solicitudes/${reservation.id}/valorar$`),
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Valorar el alquiler' })).toBeVisible();

    const scoreGroup = page.getByRole('group', { name: 'Puntuación' });
    const radios = scoreGroup.getByRole('radio');
    await expect(radios).toHaveCount(5);
    await scoreGroup.locator('label').filter({ hasText: '4 estrellas: Bien' }).click();
    await expect(scoreGroup.getByRole('radio', { name: '4 estrellas: Bien' })).toBeChecked();
    await expect(page.getByLabel('Comentario (opcional)')).toBeVisible();

    await page.getByRole('link', { name: 'Cancelar' }).click();
    await expect(page).toHaveURL(/\/mis-solicitudes$/);
    expect((await sentReservation(request, token, 'Máquina de palomitas')).myRating).toBeFalsy();
  });

  // Criterio 4 y Criterio 5
  test('sin puntuación no publica, muestra el error y enfoca la primera estrella', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request, ANA);
    const reservation = await sentReservation(request, token, 'Máquina de palomitas');
    await login(page, ANA);
    await page.goto(`/mis-solicitudes/${reservation.id}/valorar`);

    await page.getByLabel('Comentario (opcional)').fill('Una experiencia agradable.');
    await page.getByRole('button', { name: 'Publicar' }).click();

    const scoreGroup = page.getByRole('group', { name: 'Puntuación' });
    await expect(page.getByText('Elige una puntuación de 1 a 5 estrellas.')).toBeVisible();
    await expect(scoreGroup).toHaveAttribute('aria-invalid', 'true');
    await expect(scoreGroup.getByRole('radio', { name: '1 estrella: Muy mal' })).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/mis-solicitudes/${reservation.id}/valorar$`));
    expect((await sentReservation(request, token, 'Máquina de palomitas')).myRating).toBeFalsy();
  });

  // Criterio 5
  test('la API valida puntuación y longitud del comentario', async ({ request }) => {
    const token = await apiToken(request, ANA);
    const reservation = await sentReservation(request, token, 'Máquina de palomitas');
    const headers = { Authorization: `Bearer ${token}` };

    const missingScore = await request.post(
      `${API_URL}/reservas/${reservation.id}/valoracion`,
      { headers, data: { comment: 'Sin puntuación.' } },
    );
    expect(missingScore.status()).toBe(400);
    expect(await missingScore.json()).toMatchObject({ field: 'score' });

    const longComment = await request.post(
      `${API_URL}/reservas/${reservation.id}/valoracion`,
      { headers, data: { score: 4, comment: 'x'.repeat(1001) } },
    );
    expect(longComment.status()).toBe(400);
    expect(await longComment.json()).toMatchObject({ field: 'comment' });
    expect((await sentReservation(request, token, 'Máquina de palomitas')).myRating).toBeFalsy();
  });

  // Criterio 7 (con US-08.02 el propietario también valora, pero nadie más)
  test('bruno puede valorar a ana, pero alguien de fuera no puede valorar el alquiler', async ({
    page,
    request,
  }) => {
    const anaToken = await apiToken(request, ANA);
    const reservation = await sentReservation(request, anaToken, 'Máquina de palomitas');

    await login(page, BRUNO);
    await openMyReservations(page);
    const popcorn = card(page, 'Recibidas', 'Máquina de palomitas');
    await popcorn.getByRole('button', { name: /Máquina de palomitas/ }).click();
    await expect(popcorn.getByRole('link', { name: /Valorar a ana/ })).toBeVisible();

    const daniToken = await apiToken(request, DANI);
    const response = await request.post(
      `${API_URL}/reservas/${reservation.id}/valoracion`,
      { headers: { Authorization: `Bearer ${daniToken}` }, data: { score: 4, comment: 'No.' } },
    );
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Solo quien ha participado en este alquiler puede valorarlo.',
    });
  });

  // Criterio: solo se puede valorar un alquiler finalizado
  test('ana no puede valorar el proyector mientras la solicitud está pendiente', async ({
    page,
    request,
  }) => {
    const token = await apiToken(request, ANA);
    const reservation = await sentReservation(request, token, 'Proyector Full HD');

    await login(page, ANA);
    await openMyReservations(page);
    const projector = card(page, 'Enviadas', 'Proyector Full HD');
    await projector.getByRole('button', { name: /Proyector Full HD/ }).click();
    await expect(projector.getByRole('link', { name: /Valorar/ })).toHaveCount(0);

    await page.goto(`/mis-solicitudes/${reservation.id}/valorar`);
    await expect(page.getByRole('alert')).toHaveText(
      'Solo se puede valorar un alquiler finalizado.',
    );

    const response = await request.post(
      `${API_URL}/reservas/${reservation.id}/valoracion`,
      { headers: { Authorization: `Bearer ${token}` }, data: { score: 4, comment: 'No.' } },
    );
    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Solo se puede valorar un alquiler finalizado.',
    });
  });

  // Criterio 6 y Criterio 8. Publica una valoración y cambia la BD: sin reintentos en el CI, porque
  // un reintento daría siempre 409 (ya está valorada) y escondería el fallo original.
  test.describe('publicar la valoración', () => {
    test.describe.configure({ retries: 0 });

    test('ana publica una valoración que aparece en la tarjeta y no se puede repetir', async ({
      page,
      request,
    }) => {
      const token = await apiToken(request, ANA);
      const reservation = await sentReservation(request, token, 'Máquina de palomitas');
      const comment = `Valoración e2e ${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await login(page, ANA);
      await openMyReservations(page);
      const popcorn = card(page, 'Enviadas', 'Máquina de palomitas');
      await popcorn.getByRole('button', { name: /Máquina de palomitas/ }).click();
      await popcorn
        .getByRole('link', { name: 'Valorar el alquiler de Máquina de palomitas' })
        .click();
      await page.getByRole('group', { name: 'Puntuación' }).locator('label')
        .filter({ hasText: '4 estrellas: Bien' })
        .click();
      await page.getByLabel('Comentario (opcional)').fill(comment);
      await page.getByRole('button', { name: 'Publicar' }).click();

      await expect(page).toHaveURL(/\/mis-solicitudes$/);
      await expect(page.getByText('Valoración publicada.')).toBeVisible();
      const ratedCard = card(page, 'Enviadas', 'Máquina de palomitas');
      await ratedCard.getByRole('button', { name: /Máquina de palomitas/ }).click();
      await expect(ratedCard.getByText('Tu valoración')).toBeVisible();
      await expect(ratedCard.getByRole('img', { name: '4 de 5 estrellas' })).toBeVisible();
      await expect(ratedCard.getByText(`«${comment}»`)).toBeVisible();
      await expect(ratedCard.getByRole('link', { name: /Valorar/ })).toHaveCount(0);

      expect((await sentReservation(request, token, 'Máquina de palomitas')).myRating).toMatchObject({
        score: 4,
        comment,
      });

      await page.goto(`/mis-solicitudes/${reservation.id}/valorar`);
      await expect(page.getByRole('alert')).toHaveText('Ya has valorado este alquiler.');
      await expect(page.getByRole('button', { name: 'Publicar' })).toHaveCount(0);

      const duplicate = await request.post(
        `${API_URL}/reservas/${reservation.id}/valoracion`,
        { headers: { Authorization: `Bearer ${token}` }, data: { score: 4, comment } },
      );
      expect(duplicate.status()).toBe(409);
      expect(await duplicate.json()).toEqual({ error: 'Ya has valorado este alquiler.' });
    });

    // US-08.02 (#75), criterios 1 a 7: el propietario valora al inquilino de principio a fin
    test('bruno valora a ana, ana ve «Valoración recibida» y bruno no puede repetir', async ({
      page,
      request,
    }) => {
      const anaToken = await apiToken(request, ANA);
      const reservation = await sentReservation(request, anaToken, 'Máquina de palomitas');
      const comment = `La devolvió limpia ${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await login(page, BRUNO);
      await openMyReservations(page);
      const popcorn = card(page, 'Recibidas', 'Máquina de palomitas');
      await popcorn.getByRole('button', { name: /Máquina de palomitas/ }).click();
      await popcorn
        .getByRole('link', { name: 'Valorar a ana por el alquiler de Máquina de palomitas' })
        .click();
      await expect(page).toHaveURL(new RegExp(`/mis-solicitudes/${reservation.id}/valorar$`));
      await expect(page.getByRole('heading', { level: 1, name: 'Valorar a ana' })).toBeVisible();

      // Sin puntuación no se publica
      await page.getByLabel('¿Cómo ha dejado el objeto?').fill(comment);
      await page.getByRole('button', { name: 'Publicar' }).click();
      await expect(page.getByText('Elige una puntuación de 1 a 5 estrellas.')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/mis-solicitudes/${reservation.id}/valorar$`));

      await page.getByRole('group', { name: 'Puntuación' }).locator('label')
        .filter({ hasText: '5 estrellas' })
        .click();
      await page.getByRole('button', { name: 'Publicar' }).click();

      await expect(page).toHaveURL(/\/mis-solicitudes$/);
      await expect(page.getByText('Valoración publicada.')).toBeVisible();
      const ratedCard = card(page, 'Recibidas', 'Máquina de palomitas');
      await ratedCard.getByRole('button', { name: /Máquina de palomitas/ }).click();
      await expect(ratedCard.getByText('Tu valoración')).toBeVisible();
      await expect(ratedCard.getByText(`«${comment}»`)).toBeVisible();
      await expect(ratedCard.getByRole('link', { name: /Valorar a ana/ })).toHaveCount(0);

      // ana la ve en «Enviadas»
      await page.goto('/perfil');
      await page.getByRole('button', { name: 'Cerrar sesión' }).click();
      await login(page, ANA);
      await openMyReservations(page);
      const anaCard = card(page, 'Enviadas', 'Máquina de palomitas');
      await anaCard.getByRole('button', { name: /Máquina de palomitas/ }).click();
      const received = anaCard
        .locator('.reservation-rating-summary')
        .filter({ hasText: 'Valoración recibida' });
      await expect(received).toBeVisible();
      await expect(received.getByRole('img', { name: '5 de 5 estrellas' })).toBeVisible();
      await expect(received.getByText(`«${comment}»`)).toBeVisible();

      // Una sola valoración por alquiler
      const brunoToken = await apiToken(request, BRUNO);
      const duplicate = await request.post(
        `${API_URL}/reservas/${reservation.id}/valoracion`,
        { headers: { Authorization: `Bearer ${brunoToken}` }, data: { score: 3, comment } },
      );
      expect(duplicate.status()).toBe(409);
      expect(await duplicate.json()).toEqual({ error: 'Ya has valorado este alquiler.' });
    });
  });
});
