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
// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026

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
      status: 'pending',
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
