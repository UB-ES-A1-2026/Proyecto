import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { todayInSpain } from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// POST /api/reservas (US-04.01, #120): un test por cada caso del contrato publicado en la issue.
// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026

// Fecha «AAAA-MM-DD» a tantos días de hoy, para que los tests no caduquen.
function daysFromToday(days: number): string {
  const date = new Date(`${todayInSpain()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

async function setUp(dailyPrice = 5.5) {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(owner.id, { dailyPrice });
  const token = await loginAs('bruno@rentit.test');

  return { owner, renter, item, token };
}

function postReservation(token: string, body: object) {
  return request(app)
    .post('/api/reservas')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

beforeEach(async () => {
  await resetDb();
});

function getAvailability(token: string, query: object) {
  return request(app)
    .get('/api/reservas/disponibilidad')
    .set('Authorization', `Bearer ${token}`)
    .query(query);
}

describe('GET /api/reservas/disponibilidad', () => {
  it('says the item is available when it has no reservations', async () => {
    const { item, token } = await setUp();

    const response = await getAvailability(token, {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ available: true });
  });

  it.each(['accepted', 'paid', 'in_progress'] as const)(
    'says the item is not available when a %s reservation overlaps',
    async (status) => {
      const { renter, item, token } = await setUp();
      await createTestReservation(item.id, renter.id, {
        startDate: daysFromToday(11),
        endDate: daysFromToday(15),
        status,
      });

      const response = await getAvailability(token, {
        itemId: item.id,
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ available: false });
    },
  );

  it.each(['pending', 'rejected', 'cancelled', 'finished'] as const)(
    'ignores a %s reservation on the same dates',
    async (status) => {
      const { renter, item, token } = await setUp();
      await createTestReservation(item.id, renter.id, {
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
        status,
      });

      const response = await getAvailability(token, {
        itemId: item.id,
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
      });

      expect(response.body).toEqual({ available: true });
    },
  );

  it('counts both dates: a reservation ending on the start date overlaps', async () => {
    const { renter, item, token } = await setUp();
    await createTestReservation(item.id, renter.id, {
      startDate: daysFromToday(8),
      endDate: daysFromToday(10),
      status: 'accepted',
    });

    const overlapping = await getAvailability(token, {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    });
    const nextDay = await getAvailability(token, {
      itemId: item.id,
      startDate: daysFromToday(11),
      endDate: daysFromToday(12),
    });

    expect(overlapping.body).toEqual({ available: false });
    expect(nextDay.body).toEqual({ available: true });
  });

  it('ignores reservations of other items', async () => {
    const { owner, renter, item, token } = await setUp();
    const otherItem = await createTestItem(owner.id);
    await createTestReservation(otherItem.id, renter.id, {
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
      status: 'accepted',
    });

    const response = await getAvailability(token, {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    });

    expect(response.body).toEqual({ available: true });
  });

  it('requires a session', async () => {
    const { item } = await setUp();

    const response = await request(app)
      .get('/api/reservas/disponibilidad')
      .query({
        itemId: item.id,
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
      });

    expect(response.status).toBe(401);
  });

  it.each([
    ['itemId', { itemId: 'no-es-un-uuid' }],
    ['startDate', { startDate: '2026-02-30' }],
    ['endDate', { endDate: undefined }],
    ['startDate', { startDate: [daysFromToday(10), daysFromToday(11)] }],
  ])('rejects an invalid %s', async (field, override) => {
    const { item, token } = await setUp();

    const response = await getAvailability(token, {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
      ...override,
    });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe(field);
  });

  it('rejects a start date before today', async () => {
    const { item, token } = await setUp();

    const response = await getAvailability(token, {
      itemId: item.id,
      startDate: daysFromToday(-1),
      endDate: daysFromToday(2),
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'La fecha de inicio no puede ser anterior a hoy.',
      field: 'startDate',
    });
  });

  it('rejects an end date before the start date', async () => {
    const { item, token } = await setUp();

    const response = await getAvailability(token, {
      itemId: item.id,
      startDate: daysFromToday(12),
      endDate: daysFromToday(10),
    });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('endDate');
  });

  it('returns 404 when the item does not exist', async () => {
    const { token } = await setUp();

    const response = await getAvailability(token, {
      itemId: '00000000-0000-4000-8000-000000000000',
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    });

    expect(response.status).toBe(404);
  });

  it.each(['paused', 'withdrawn'] as const)(
    'returns 404 when the item is %s',
    async (status) => {
      const { owner, token } = await setUp();
      const item = await createTestItem(owner.id, { status });

      const response = await getAvailability(token, {
        itemId: item.id,
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
      });

      expect(response.status).toBe(404);
    },
  );
});

describe('POST /api/reservas', () => {
  it('creates a pending reservation with the agreed response shape', async () => {
    const { owner, renter, item, token } = await setUp();
    const startDate = daysFromToday(10);
    const endDate = daysFromToday(12);

    const response = await postReservation(token, {
      itemId: item.id,
      startDate,
      endDate,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      item: { id: item.id, title: item.title },
      startDate,
      endDate,
      totalPrice: '16.50',
      deposit: '30.00',
      deliveryAmount: '0.00',
      status: 'pending',
      expiresAt: null,
      renter: { id: renter.id, username: 'bruno' },
      owner: { id: owner.id, username: 'ana' },
      createdAt: expect.any(String),
    });

    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: response.body.id as string },
    });
    expect(saved.status).toBe('pending');
    expect(saved.renterId).toBe(renter.id);
    expect(saved.totalPrice.toFixed(2)).toBe('16.50');
  });

  it('accepts a one-day rental starting today', async () => {
    const { item, token } = await setUp();
    const today = todayInSpain();

    const response = await postReservation(token, {
      itemId: item.id,
      startDate: today,
      endDate: today,
    });

    expect(response.status).toBe(201);
    expect(response.body.totalPrice).toBe('5.50');
  });

  it('calculates the price on the server and ignores one sent by the client', async () => {
    const { item, token } = await setUp();
    const startDate = daysFromToday(1);

    const response = await postReservation(token, {
      itemId: item.id,
      startDate,
      endDate: startDate,
      totalPrice: '0.01',
    });

    expect(response.status).toBe(201);
    expect(response.body.totalPrice).toBe('5.50');
  });

  it('returns 401 without a session', async () => {
    const response = await request(app).post('/api/reservas').send({});

    expect(response.status).toBe(401);
  });

  it.each([
    ['itemId', { itemId: 'no-es-un-uuid' }],
    ['itemId', { itemId: undefined }],
    ['startDate', { startDate: undefined }],
    ['startDate', { startDate: '04/12/2030' }],
    ['startDate', { startDate: '2030-02-30' }],
    ['endDate', { endDate: undefined }],
    ['endDate', { endDate: 20301204 }],
  ])('returns 400 for an invalid %s (%j)', async (field, overrides) => {
    const { item, token } = await setUp();

    const response = await postReservation(token, {
      itemId: item.id,
      startDate: daysFromToday(1),
      endDate: daysFromToday(2),
      ...overrides,
    });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe(field);
    expect(await prisma.reservation.count()).toBe(0);
  });

  it('returns 400 when the start date is in the past', async () => {
    const { item, token } = await setUp();

    const response = await postReservation(token, {
      itemId: item.id,
      startDate: daysFromToday(-1),
      endDate: daysFromToday(1),
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'La fecha de inicio no puede ser anterior a hoy.',
      field: 'startDate',
    });
  });

  it('returns 400 when the end date is before the start date', async () => {
    const { item, token } = await setUp();

    const response = await postReservation(token, {
      itemId: item.id,
      startDate: daysFromToday(3),
      endDate: daysFromToday(2),
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
      field: 'endDate',
    });
  });

  it('returns 400 when the total does not fit in the database column', async () => {
    const { item, token } = await setUp(99_999_999);

    const response = await postReservation(token, {
      itemId: item.id,
      startDate: daysFromToday(1),
      endDate: daysFromToday(3),
    });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('endDate');
    expect(await prisma.reservation.count()).toBe(0);
  });

  it('returns 403 when renting your own item', async () => {
    const { item } = await setUp();
    const ownerToken = await loginAs('ana@rentit.test');

    const response = await postReservation(ownerToken, {
      itemId: item.id,
      startDate: daysFromToday(1),
      endDate: daysFromToday(2),
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'No puedes alquilar tu propio objeto.',
    });
  });

  it('returns 404 when the item does not exist', async () => {
    const { token } = await setUp();

    const response = await postReservation(token, {
      itemId: '00000000-0000-4000-8000-000000000000',
      startDate: daysFromToday(1),
      endDate: daysFromToday(2),
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'No hemos encontrado este objeto.',
    });
  });

  it.each(['paused', 'withdrawn'] as const)(
    'returns 404 when the item is %s',
    async (status) => {
      const { owner, token } = await setUp();
      const item = await createTestItem(owner.id, { status });

      const response = await postReservation(token, {
        itemId: item.id,
        startDate: daysFromToday(1),
        endDate: daysFromToday(2),
      });

      expect(response.status).toBe(404);
    },
  );

  it.each(['accepted', 'paid', 'in_progress'] as const)(
    'returns 409 when the dates overlap a reservation that is %s',
    async (status) => {
      const { renter, item, token } = await setUp();
      await createTestReservation(item.id, renter.id, {
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
        status,
      });

      const response = await postReservation(token, {
        itemId: item.id,
        startDate: daysFromToday(12),
        endDate: daysFromToday(14),
      });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: 'El objeto no está disponible en esas fechas.',
        field: 'startDate',
      });
    },
  );

  it.each(['pending', 'rejected', 'cancelled', 'finished'] as const)(
    'does not block the dates of a reservation that is %s',
    async (status) => {
      const { item, token } = await setUp();
      const otherRenter = await createTestUser({
        username: 'carla',
        email: 'carla@rentit.test',
      });
      await createTestReservation(item.id, otherRenter.id, {
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
        status,
      });

      const response = await postReservation(token, {
        itemId: item.id,
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
      });

      expect(response.status).toBe(201);
    },
  );

  // La reserva aceptada va del día 10 al 12.
  it.each([
    ['starts inside and ends after', 11, 14],
    ['starts before and ends inside', 8, 11],
    ['ends on its first day', 8, 10],
    ['starts on its last day', 12, 14],
    ['is inside', 11, 11],
    ['wraps around it', 9, 15],
    ['has the same dates', 10, 12],
  ])(
    'returns 409 when the request %s an accepted reservation',
    async (_case, startDay, endDay) => {
      const { renter, item, token } = await setUp();
      await createTestReservation(item.id, renter.id, {
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
        status: 'accepted',
      });

      const response = await postReservation(token, {
        itemId: item.id,
        startDate: daysFromToday(startDay),
        endDate: daysFromToday(endDay),
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe(
        'El objeto no está disponible en esas fechas.',
      );
    },
  );

  it('accepts dates right before an accepted reservation', async () => {
    const { renter, item, token } = await setUp();
    await createTestReservation(item.id, renter.id, {
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
      status: 'accepted',
    });

    const response = await postReservation(token, {
      itemId: item.id,
      startDate: daysFromToday(8),
      endDate: daysFromToday(9),
    });

    expect(response.status).toBe(201);
  });

  it('accepts dates right after an accepted reservation', async () => {
    const { renter, item, token } = await setUp();
    await createTestReservation(item.id, renter.id, {
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
      status: 'accepted',
    });

    const response = await postReservation(token, {
      itemId: item.id,
      startDate: daysFromToday(13),
      endDate: daysFromToday(14),
    });

    expect(response.status).toBe(201);
  });

  it('does not take into account the reservations of other items', async () => {
    const { owner, renter, item, token } = await setUp();
    const otherItem = await createTestItem(owner.id, { title: 'Escalera' });
    await createTestReservation(otherItem.id, renter.id, {
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
      status: 'accepted',
    });

    const response = await postReservation(token, {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    });

    expect(response.status).toBe(201);
  });
});

describe('POST /api/reservas: solicitudes duplicadas', () => {
  it('returns 409 when the user already has a pending request for the same dates', async () => {
    const { item, token } = await setUp();
    const body = {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    };
    await postReservation(token, body);

    const response = await postReservation(token, body);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Ya tienes una solicitud pendiente para estas fechas.',
    });
    expect(await prisma.reservation.count()).toBe(1);
  });

  it('only creates one reservation with a double click', async () => {
    const { item, token } = await setUp();
    const body = {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    };

    const responses = await Promise.all([
      postReservation(token, body),
      postReservation(token, body),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.reservation.count()).toBe(1);
  });

  it('allows the same user to request other dates', async () => {
    const { item, token } = await setUp();
    await postReservation(token, {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    });

    const response = await postReservation(token, {
      itemId: item.id,
      startDate: daysFromToday(11),
      endDate: daysFromToday(13),
    });

    expect(response.status).toBe(201);
  });

  it('allows another user to request the same dates', async () => {
    const { item, token } = await setUp();
    await createTestUser({ username: 'carla', email: 'carla@rentit.test' });
    const body = {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    };
    await postReservation(token, body);

    const response = await postReservation(
      await loginAs('carla@rentit.test'),
      body,
    );

    expect(response.status).toBe(201);
  });

  it.each(['rejected', 'cancelled'] as const)(
    'allows requesting the same dates again after a %s request',
    async (status) => {
      const { renter, item, token } = await setUp();
      await createTestReservation(item.id, renter.id, {
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
        status,
      });

      const response = await postReservation(token, {
        itemId: item.id,
        startDate: daysFromToday(10),
        endDate: daysFromToday(12),
      });

      expect(response.status).toBe(201);
    },
  );
});
