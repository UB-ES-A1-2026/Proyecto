// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 12/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

const NOT_FOUND = { error: 'No hemos encontrado este objeto.' };
const DECEMBER = { from: '2026-12-01', to: '2026-12-31' };

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

function getDemand(id: string, query: Record<string, string>, token?: string) {
  const call = request(app).get(`/api/objetos/${id}/demanda`).query(query);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

// ana publica el objeto; bruno, carla y dani son posibles arrendatarios.
async function createUsers() {
  const ana = await createTestUser();
  const bruno = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const carla = await createTestUser({
    username: 'carla',
    email: 'carla@rentit.test',
  });
  const dani = await createTestUser({
    username: 'dani',
    email: 'dani@rentit.test',
  });
  return { ana, bruno, carla, dani };
}

describe('GET /api/objetos/:id/demanda (US-04.07, #311)', () => {
  it('counts pending requests per day and the distinct requests in the range', async () => {
    const { ana, bruno, carla } = await createUsers();
    const item = await createTestItem(ana.id);
    await createTestReservation(item.id, bruno.id, {
      startDate: '2026-12-04',
      endDate: '2026-12-06',
    });
    await createTestReservation(item.id, carla.id, {
      startDate: '2026-12-05',
      endDate: '2026-12-05',
    });

    const response = await getDemand(item.id, DECEMBER);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: [
        { date: '2026-12-04', pendingRequests: 1 },
        { date: '2026-12-05', pendingRequests: 2 },
        { date: '2026-12-06', pendingRequests: 1 },
      ],
      pendingRequests: 2,
    });
  });

  it('only counts pending requests, not accepted, rejected or cancelled ones', async () => {
    const { ana, bruno, carla, dani } = await createUsers();
    const item = await createTestItem(ana.id);
    await createTestReservation(item.id, bruno.id, { status: 'accepted' });
    await createTestReservation(item.id, carla.id, { status: 'rejected' });
    await createTestReservation(item.id, dani.id, { status: 'cancelled' });

    const response = await getDemand(item.id, DECEMBER);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ days: [], pendingRequests: 0 });
  });

  it('does not count the viewer own requests and never says who made them', async () => {
    const { ana, bruno, carla } = await createUsers();
    const item = await createTestItem(ana.id);
    await createTestReservation(item.id, bruno.id);
    await createTestReservation(item.id, carla.id);
    const token = await loginAs('bruno@rentit.test');

    const response = await getDemand(item.id, DECEMBER, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: [
        { date: '2026-12-01', pendingRequests: 1 },
        { date: '2026-12-02', pendingRequests: 1 },
        { date: '2026-12-03', pendingRequests: 1 },
      ],
      pendingRequests: 1,
    });
    expect(JSON.stringify(response.body)).not.toContain(carla.id);
  });

  it('only returns the days inside the requested range', async () => {
    const { ana, bruno } = await createUsers();
    const item = await createTestItem(ana.id);
    await createTestReservation(item.id, bruno.id, {
      startDate: '2026-11-29',
      endDate: '2026-12-02',
    });

    const response = await getDemand(item.id, {
      from: '2026-12-01',
      to: '2026-12-01',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: [{ date: '2026-12-01', pendingRequests: 1 }],
      pendingRequests: 1,
    });
  });

  it('lets the owner see the demand of a paused item but not other people', async () => {
    const { ana } = await createUsers();
    const item = await createTestItem(ana.id, { status: 'paused' });

    const asOwner = await getDemand(
      item.id,
      DECEMBER,
      await loginAs('ana@rentit.test'),
    );
    const asGuest = await getDemand(item.id, DECEMBER);

    expect(asOwner.status).toBe(200);
    expect(asGuest.status).toBe(404);
    expect(asGuest.body).toEqual(NOT_FOUND);
  });

  it('returns 404 for an item that does not exist or an id that is not a UUID', async () => {
    const missing = await getDemand(
      '00000000-0000-4000-8000-000000000000',
      DECEMBER,
    );
    const notUuid = await getDemand('abc', DECEMBER);

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(NOT_FOUND);
    expect(notUuid.status).toBe(404);
    expect(notUuid.body).toEqual(NOT_FOUND);
  });

  it('returns 400 when a date is missing or is not a real date', async () => {
    const { ana } = await createUsers();
    const item = await createTestItem(ana.id);

    const noFrom = await getDemand(item.id, { to: '2026-12-31' });
    const badTo = await getDemand(item.id, {
      from: '2026-02-01',
      to: '2026-02-30',
    });

    expect(noFrom.status).toBe(400);
    expect(noFrom.body.field).toBe('from');
    expect(badTo.status).toBe(400);
    expect(badTo.body.field).toBe('to');
  });

  it('returns 400 when the range ends before it starts or is longer than a year', async () => {
    const { ana } = await createUsers();
    const item = await createTestItem(ana.id);

    const reversed = await getDemand(item.id, {
      from: '2026-12-10',
      to: '2026-12-01',
    });
    const tooLong = await getDemand(item.id, {
      from: '2026-01-01',
      to: '2027-01-02',
    });

    expect(reversed.status).toBe(400);
    expect(reversed.body).toEqual({
      error: 'La fecha final no puede ser anterior a la fecha inicial.',
      field: 'to',
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.field).toBe('to');
  });
});
