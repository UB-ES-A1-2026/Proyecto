import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// POST /api/reservas/:id/valoracion (US-08.01, #295): un test por cada caso del contrato.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 15/11/2026

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// ana es la propietaria y bruno el arrendatario de un alquiler finalizado.
async function finishedRental(
  status:
    'finished' | 'pending' | 'accepted' | 'paid' | 'in_progress' = 'finished',
) {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(owner.id);
  const reservation = await createTestReservation(item.id, renter.id, {
    status,
  });

  return {
    owner,
    renter,
    reservation,
    ownerToken: await loginAs('ana@rentit.test'),
    renterToken: await loginAs('bruno@rentit.test'),
  };
}

function rate(id: string, body: unknown, token?: string) {
  const call = request(app)
    .post(`/api/reservas/${id}/valoracion`)
    .send(body as object);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

describe('POST /api/reservas/:id/valoracion', () => {
  it('saves the rating of a finished rental for the owner of the item', async () => {
    const { owner, renter, reservation, renterToken } = await finishedRental();

    const response = await rate(
      reservation.id,
      { score: 4, comment: '  Todo perfecto  ' },
      renterToken,
    );

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      reservationId: reservation.id,
      type: 'rental',
      score: 4,
      comment: 'Todo perfecto',
      createdAt: expect.any(String),
    });
    const saved = await prisma.rating.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(saved.authorId).toBe(renter.id);
    expect(saved.ratedUserId).toBe(owner.id);
  });

  it.each([undefined, '', '   '])(
    'saves the comment as null when it is %j',
    async (comment) => {
      const { reservation, renterToken } = await finishedRental();

      const response = await rate(
        reservation.id,
        { score: 5, comment },
        renterToken,
      );

      expect(response.status).toBe(201);
      expect(response.body.comment).toBeNull();
    },
  );

  it.each([undefined, 0, 6, 4.5, '4', null])(
    'returns 400 when the score is %j',
    async (score) => {
      const { reservation, renterToken } = await finishedRental();

      const response = await rate(reservation.id, { score }, renterToken);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Elige una puntuación de 1 a 5 estrellas.',
        field: 'score',
      });
      expect(await prisma.rating.count()).toBe(0);
    },
  );

  it('returns 400 when the comment is longer than 1000 characters', async () => {
    const { reservation, renterToken } = await finishedRental();

    const response = await rate(
      reservation.id,
      { score: 3, comment: 'a'.repeat(1001) },
      renterToken,
    );

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('comment');
    expect(await prisma.rating.count()).toBe(0);
  });

  it('accepts a comment of exactly 1000 characters', async () => {
    const { reservation, renterToken } = await finishedRental();

    const response = await rate(
      reservation.id,
      { score: 3, comment: 'a'.repeat(1000) },
      renterToken,
    );

    expect(response.status).toBe(201);
  });

  it('returns 401 without a session', async () => {
    const { reservation } = await finishedRental();

    const response = await rate(reservation.id, { score: 4 });

    expect(response.status).toBe(401);
  });

  it.each(['00000000-0000-0000-0000-000000000000', 'no-es-un-id'])(
    'returns 404 when the rental %s does not exist',
    async (id) => {
      const { renterToken } = await finishedRental();

      const response = await rate(id, { score: 4 }, renterToken);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'No hemos encontrado este alquiler.',
      });
    },
  );

  it('lets the owner rate the renter (US-08.02)', async () => {
    const { owner, renter, reservation, ownerToken } = await finishedRental();

    const response = await rate(
      reservation.id,
      { score: 3, comment: 'Lo devolvió algo sucio' },
      ownerToken,
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      reservationId: reservation.id,
      type: 'user',
      score: 3,
      comment: 'Lo devolvió algo sucio',
    });
    const saved = await prisma.rating.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(saved.authorId).toBe(owner.id);
    expect(saved.ratedUserId).toBe(renter.id);
  });

  it('lets each side rate the same rental once', async () => {
    const { reservation, ownerToken, renterToken } = await finishedRental();

    const byRenter = await rate(reservation.id, { score: 5 }, renterToken);
    const byOwner = await rate(reservation.id, { score: 4 }, ownerToken);
    const ownerAgain = await rate(reservation.id, { score: 2 }, ownerToken);

    expect([byRenter.status, byOwner.status, ownerAgain.status]).toEqual([
      201, 201, 409,
    ]);
    expect(await prisma.rating.count()).toBe(2);
  });

  it('returns 403 when someone outside the rental tries to rate it', async () => {
    const { reservation } = await finishedRental();
    await createTestUser({ username: 'carla', email: 'carla@rentit.test' });
    const token = await loginAs('carla@rentit.test');

    const response = await rate(reservation.id, { score: 4 }, token);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Solo quien ha participado en este alquiler puede valorarlo.',
    });
  });

  it.each(['pending', 'accepted', 'paid', 'in_progress'] as const)(
    'returns 409 when the rental is %s',
    async (status) => {
      const { reservation, renterToken } = await finishedRental(status);

      const response = await rate(reservation.id, { score: 4 }, renterToken);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: 'Solo se puede valorar un alquiler finalizado.',
      });
    },
  );

  it('returns 409 when the renter has already rated the rental', async () => {
    const { reservation, renterToken } = await finishedRental();
    await rate(reservation.id, { score: 4 }, renterToken);

    const response = await rate(reservation.id, { score: 2 }, renterToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Ya has valorado este alquiler.' });
    expect(await prisma.rating.count()).toBe(1);
  });

  it('keeps a single rating on a double click', async () => {
    const { reservation, renterToken } = await finishedRental();

    const responses = await Promise.all([
      rate(reservation.id, { score: 4 }, renterToken),
      rate(reservation.id, { score: 4 }, renterToken),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.rating.count()).toBe(1);
  });

  it('shows the rating in «Mis solicitudes» only to the person who wrote it', async () => {
    const { reservation, renterToken, ownerToken } = await finishedRental();
    await rate(reservation.id, { score: 5, comment: 'Genial' }, renterToken);

    const renterView = await request(app)
      .get('/api/usuarios/me/reservas')
      .set('Authorization', `Bearer ${renterToken}`);
    const ownerView = await request(app)
      .get('/api/usuarios/me/reservas')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(renterView.body.sent[0].myRating).toEqual({
      score: 5,
      comment: 'Genial',
      createdAt: expect.any(String),
    });
    // El propietario aún no ha escrito la suya (eso es US-08.02).
    expect(ownerView.body.received[0].myRating).toBeNull();
  });
});
