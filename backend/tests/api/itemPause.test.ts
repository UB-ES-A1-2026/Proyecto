import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// POST /api/objetos/:id/pausar y /reanudar (US-02.04, #112): contrato publicado en la issue.
// Generado con asistencia de IA (Claude)

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// Ana es la propietaria del objeto y Bruno, otro usuario.
async function setUp(status: 'published' | 'paused' | 'withdrawn') {
  const ana = await createTestUser();
  const bruno = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(ana.id, { status, dailyPrice: 5.5 });
  const token = await loginAs('ana@rentit.test');

  return { ana, bruno, item, token };
}

function post(token: string, id: string, action: 'pausar' | 'reanudar') {
  return request(app)
    .post(`/api/objetos/${id}/${action}`)
    .set('Authorization', `Bearer ${token}`);
}

async function statusOf(id: string) {
  const item = await prisma.item.findUniqueOrThrow({ where: { id } });
  return item.status;
}

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/objetos/:id/pausar', () => {
  it('pauses a published item and returns the agreed fields', async () => {
    const { item, token } = await setUp('published');

    const response = await post(token, item.id, 'pausar');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: item.id,
      title: item.title,
      dailyPrice: '5.50',
      neighborhood: item.neighborhood,
      status: 'paused',
    });
    expect(await statusOf(item.id)).toBe('paused');
  });

  it.each(['paused', 'withdrawn'] as const)(
    'returns 409 when the item is %s and does not change it',
    async (status) => {
      const { item, token } = await setUp(status);

      const response = await post(token, item.id, 'pausar');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: 'Solo se puede pausar un objeto publicado.',
      });
      expect(await statusOf(item.id)).toBe(status);
    },
  );

  it('does not change the existing reservations of the item', async () => {
    const { bruno, item, token } = await setUp('published');
    const reservation = await createTestReservation(item.id, bruno.id, {
      status: 'accepted',
    });

    const response = await post(token, item.id, 'pausar');

    expect(response.status).toBe(200);
    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(saved.status).toBe('accepted');
  });

  it('only changes the status once when two requests arrive at the same time', async () => {
    const { item, token } = await setUp('published');

    const responses = await Promise.all([
      post(token, item.id, 'pausar'),
      post(token, item.id, 'pausar'),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  });
});

describe('POST /api/objetos/:id/reanudar', () => {
  it('resumes a paused item and returns the agreed fields', async () => {
    const { item, token } = await setUp('paused');

    const response = await post(token, item.id, 'reanudar');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('published');
    expect(await statusOf(item.id)).toBe('published');
  });

  it.each(['published', 'withdrawn'] as const)(
    'returns 409 when the item is %s and does not change it',
    async (status) => {
      const { item, token } = await setUp(status);

      const response = await post(token, item.id, 'reanudar');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: 'Solo se puede reanudar un objeto pausado.',
      });
      expect(await statusOf(item.id)).toBe(status);
    },
  );
});

describe.each(['pausar', 'reanudar'] as const)(
  'common rules of %s',
  (action) => {
    const initialStatus = action === 'pausar' ? 'published' : 'paused';

    it('returns 401 without a session', async () => {
      const { item } = await setUp(initialStatus);

      const response = await request(app).post(
        `/api/objetos/${item.id}/${action}`,
      );

      expect(response.status).toBe(401);
      expect(await statusOf(item.id)).toBe(initialStatus);
    });

    it('returns 403 when the user is not the owner and changes nothing', async () => {
      const { item } = await setUp(initialStatus);
      const brunoToken = await loginAs('bruno@rentit.test');

      const response = await post(brunoToken, item.id, action);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'Solo el propietario puede cambiar el estado de este objeto.',
      });
      expect(await statusOf(item.id)).toBe(initialStatus);
    });

    it.each([
      ['that does not exist', '00000000-0000-4000-8000-000000000000'],
      ['with an id that is not a UUID', 'no-es-un-uuid'],
    ])('returns 404 for an item %s', async (_case, id) => {
      const { token } = await setUp(initialStatus);

      const response = await post(token, id, action);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'No hemos encontrado este objeto.',
      });
    });
  },
);
