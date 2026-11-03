import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// POST /api/objetos/:id/retirar (US-02.03, #110): contrato publicado en la issue.
// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// Ana es la propietaria del objeto y Bruno, otro usuario.
async function setUp(
  status: 'published' | 'paused' | 'withdrawn' = 'published',
) {
  const ana = await createTestUser();
  const bruno = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(ana.id, { status, dailyPrice: 5.5 });
  const token = await loginAs('ana@rentit.test');

  return { ana, bruno, item, token };
}

function withdraw(token: string, id: string) {
  return request(app)
    .post(`/api/objetos/${id}/retirar`)
    .set('Authorization', `Bearer ${token}`);
}

async function statusOf(id: string) {
  const item = await prisma.item.findUniqueOrThrow({ where: { id } });
  return item.status;
}

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/objetos/:id/retirar', () => {
  it.each(['published', 'paused'] as const)(
    'withdraws a %s item and returns the agreed fields',
    async (status) => {
      const { item, token } = await setUp(status);

      const response = await withdraw(token, item.id);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: item.id,
        title: item.title,
        dailyPrice: '5.50',
        neighborhood: item.neighborhood,
        status: 'withdrawn',
      });
      expect(await statusOf(item.id)).toBe('withdrawn');
    },
  );

  it('does not delete the item', async () => {
    const { item, token } = await setUp();

    await withdraw(token, item.id);

    expect(await prisma.item.count({ where: { id: item.id } })).toBe(1);
  });

  it('returns 401 without a session', async () => {
    const { item } = await setUp();

    const response = await request(app).post(`/api/objetos/${item.id}/retirar`);

    expect(response.status).toBe(401);
    expect(await statusOf(item.id)).toBe('published');
  });

  it('returns 403 when the user is not the owner and changes nothing', async () => {
    const { item } = await setUp();
    const brunoToken = await loginAs('bruno@rentit.test');

    const response = await withdraw(brunoToken, item.id);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Solo el propietario puede retirar este objeto.',
    });
    expect(await statusOf(item.id)).toBe('published');
  });

  it.each([
    ['that does not exist', '00000000-0000-4000-8000-000000000000'],
    ['with an id that is not a UUID', 'no-es-un-uuid'],
  ])('returns 404 for an item %s', async (_case, id) => {
    const { token } = await setUp();

    const response = await withdraw(token, id);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'No hemos encontrado este objeto.',
    });
  });

  it('returns 409 when the item is already withdrawn', async () => {
    const { item, token } = await setUp('withdrawn');

    const response = await withdraw(token, item.id);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Este objeto ya está retirado.' });
  });

  it.each(['pending', 'accepted', 'paid', 'in_progress'] as const)(
    'returns 409 and changes nothing when it has a reservation that is %s',
    async (status) => {
      const { bruno, item, token } = await setUp();
      await createTestReservation(item.id, bruno.id, { status });

      const response = await withdraw(token, item.id);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: 'No puedes retirar un objeto con reservas activas.',
      });
      expect(await statusOf(item.id)).toBe('published');
    },
  );

  it.each(['rejected', 'cancelled', 'finished'] as const)(
    'can be withdrawn when its only reservation is %s',
    async (status) => {
      const { bruno, item, token } = await setUp();
      await createTestReservation(item.id, bruno.id, { status });

      const response = await withdraw(token, item.id);

      expect(response.status).toBe(200);
      expect(await statusOf(item.id)).toBe('withdrawn');
    },
  );

  it('does not take into account the reservations of other items', async () => {
    const { ana, bruno, item, token } = await setUp();
    const otherItem = await createTestItem(ana.id, { title: 'Escalera' });
    await createTestReservation(otherItem.id, bruno.id, { status: 'accepted' });

    const response = await withdraw(token, item.id);

    expect(response.status).toBe(200);
  });

  it('only withdraws once when two requests arrive at the same time', async () => {
    const { item, token } = await setUp();

    const responses = await Promise.all([
      withdraw(token, item.id),
      withdraw(token, item.id),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  });
});
