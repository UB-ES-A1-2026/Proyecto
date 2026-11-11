import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// GET /api/usuarios/me/reservas (US-04.02, #123): contrato acordado con Danyal en la issue.
// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

function getMyReservations(token: string) {
  return request(app)
    .get('/api/usuarios/me/reservas')
    .set('Authorization', `Bearer ${token}`);
}

// Ana es la propietaria del objeto y Bruno quien lo solicita.
async function setUp() {
  const ana = await createTestUser();
  const bruno = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(ana.id);

  return { ana, bruno, item };
}

beforeEach(async () => {
  await resetDb();
});

describe('GET /api/usuarios/me/reservas', () => {
  it('returns 401 without a session', async () => {
    const response = await request(app).get('/api/usuarios/me/reservas');

    expect(response.status).toBe(401);
  });

  it('returns empty lists when the user has no reservations', async () => {
    await setUp();
    const token = await loginAs('bruno@rentit.test');

    const response = await getMyReservations(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: [], received: [] });
  });

  it('returns the reservations the user has made in sent, with the agreed shape', async () => {
    const { ana, bruno, item } = await setUp();
    const reservation = await createTestReservation(item.id, bruno.id, {
      startDate: '2026-12-04',
      endDate: '2026-12-06',
      totalPrice: 15,
    });
    const token = await loginAs('bruno@rentit.test');

    const response = await getMyReservations(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      sent: [
        {
          id: reservation.id,
          item: { id: item.id, title: item.title },
          startDate: '2026-12-04',
          endDate: '2026-12-06',
          totalPrice: '15.00',
          status: 'pending',
          renter: { id: bruno.id, username: 'bruno' },
          owner: { id: ana.id, username: 'ana' },
          delivery: null,
          createdAt: reservation.createdAt.toISOString(),
        },
      ],
      received: [],
    });
  });

  it('returns the reservations of the items of the user in received', async () => {
    const { bruno, item } = await setUp();
    const reservation = await createTestReservation(item.id, bruno.id);
    const token = await loginAs('ana@rentit.test');

    const response = await getMyReservations(token);

    expect(response.body.sent).toEqual([]);
    expect(response.body.received).toHaveLength(1);
    expect(response.body.received[0].id).toBe(reservation.id);
    expect(response.body.received[0].renter.username).toBe('bruno');
  });

  it('separates sent and received when the user does both', async () => {
    const { ana, bruno, item } = await setUp();
    const brunoItem = await createTestItem(bruno.id, { title: 'Escalera' });
    const received = await createTestReservation(item.id, bruno.id);
    const sent = await createTestReservation(brunoItem.id, ana.id);
    const token = await loginAs('ana@rentit.test');

    const response = await getMyReservations(token);

    expect(response.body.sent.map(({ id }: { id: string }) => id)).toEqual([
      sent.id,
    ]);
    expect(response.body.received.map(({ id }: { id: string }) => id)).toEqual([
      received.id,
    ]);
  });

  it('does not return reservations of other users', async () => {
    const { bruno, item } = await setUp();
    await createTestUser({ username: 'carla', email: 'carla@rentit.test' });
    await createTestReservation(item.id, bruno.id);
    const token = await loginAs('carla@rentit.test');

    const response = await getMyReservations(token);

    expect(response.body).toEqual({ sent: [], received: [] });
  });

  it('sorts both lists from newest to oldest', async () => {
    const { bruno, item } = await setUp();
    const older = await createTestReservation(item.id, bruno.id);
    const newer = await createTestReservation(item.id, bruno.id);
    await prisma.reservation.update({
      where: { id: older.id },
      data: { createdAt: new Date('2026-01-01T10:00:00.000Z') },
    });
    await prisma.reservation.update({
      where: { id: newer.id },
      data: { createdAt: new Date('2026-01-02T10:00:00.000Z') },
    });

    const sent = await getMyReservations(await loginAs('bruno@rentit.test'));
    const received = await getMyReservations(await loginAs('ana@rentit.test'));

    const ids = ({ id }: { id: string }) => id;
    expect(sent.body.sent.map(ids)).toEqual([newer.id, older.id]);
    expect(received.body.received.map(ids)).toEqual([newer.id, older.id]);
  });

  it.each([
    'pending',
    'accepted',
    'rejected',
    'cancelled',
    'paid',
    'in_progress',
    'finished',
  ] as const)('includes reservations in status %s', async (status) => {
    const { bruno, item } = await setUp();
    await createTestReservation(item.id, bruno.id, { status });
    const token = await loginAs('bruno@rentit.test');

    const response = await getMyReservations(token);

    expect(response.body.sent[0].status).toBe(status);
  });

  it('keeps showing reservations of an item that has been withdrawn', async () => {
    const { ana, bruno } = await setUp();
    const item = await createTestItem(ana.id, { status: 'withdrawn' });
    await createTestReservation(item.id, bruno.id);
    const token = await loginAs('bruno@rentit.test');

    const response = await getMyReservations(token);

    expect(response.body.sent).toHaveLength(1);
  });

  it('does not expose emails or password hashes', async () => {
    const { bruno, item } = await setUp();
    await createTestReservation(item.id, bruno.id);
    const token = await loginAs('bruno@rentit.test');

    const response = await getMyReservations(token);

    expect(JSON.stringify(response.body)).not.toContain('@rentit.test');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });
});
