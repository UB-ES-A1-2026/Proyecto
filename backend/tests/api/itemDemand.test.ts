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

// Pide la demanda con la sesión indicada. Requiere sesión, como el calendario donde se usa.
function getDemand(id: string, query: Record<string, string>, token: string) {
  return request(app)
    .get(`/api/objetos/${id}/demanda`)
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

// ana publica el objeto y mira su demanda; bruno, carla y dani son posibles arrendatarios.
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

    const response = await getDemand(
      item.id,
      DECEMBER,
      await loginAs('ana@rentit.test'),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: [
        { date: '2026-12-04', pendingRequests: 1 },
        { date: '2026-12-05', pendingRequests: 2 },
        { date: '2026-12-06', pendingRequests: 1 },
      ],
      pendingRequests: 2,
      bookedDays: [],
    });
  });

  it('only counts pending requests, not accepted, rejected or cancelled ones', async () => {
    const { ana, bruno, carla, dani } = await createUsers();
    const item = await createTestItem(ana.id);
    await createTestReservation(item.id, bruno.id, { status: 'accepted' });
    await createTestReservation(item.id, carla.id, { status: 'rejected' });
    await createTestReservation(item.id, dani.id, { status: 'cancelled' });

    const response = await getDemand(
      item.id,
      DECEMBER,
      await loginAs('ana@rentit.test'),
    );

    expect(response.status).toBe(200);
    // La aceptada (1–3 de diciembre) ocupa esos días: sale en bookedDays, sin decir de quién es.
    expect(response.body).toEqual({
      days: [],
      pendingRequests: 0,
      bookedDays: ['2026-12-01', '2026-12-02', '2026-12-03'],
    });
    expect(JSON.stringify(response.body)).not.toContain(bruno.id);
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
      bookedDays: [],
    });
    expect(JSON.stringify(response.body)).not.toContain(carla.id);
  });

  it('cuts a request that starts before the range', async () => {
    const { ana, bruno } = await createUsers();
    const item = await createTestItem(ana.id);
    await createTestReservation(item.id, bruno.id, {
      startDate: '2026-11-29',
      endDate: '2026-12-02',
    });

    const response = await getDemand(
      item.id,
      { from: '2026-12-01', to: '2026-12-01' },
      await loginAs('ana@rentit.test'),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: [{ date: '2026-12-01', pendingRequests: 1 }],
      pendingRequests: 1,
      bookedDays: [],
    });
  });

  it('cuts a request that ends after the range', async () => {
    const { ana, bruno } = await createUsers();
    const item = await createTestItem(ana.id);
    await createTestReservation(item.id, bruno.id, {
      startDate: '2026-12-30',
      endDate: '2027-01-02',
    });

    const response = await getDemand(
      item.id,
      DECEMBER,
      await loginAs('ana@rentit.test'),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: [
        { date: '2026-12-30', pendingRequests: 1 },
        { date: '2026-12-31', pendingRequests: 1 },
      ],
      pendingRequests: 1,
      bookedDays: [],
    });
  });

  // Días ya reservados (#312). Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
  it('returns the days booked by accepted, paid or in-progress reservations, cut to the range', async () => {
    const { ana, bruno, carla, dani } = await createUsers();
    const item = await createTestItem(ana.id);
    await createTestReservation(item.id, bruno.id, {
      startDate: '2026-11-30',
      endDate: '2026-12-01',
      status: 'paid',
    });
    await createTestReservation(item.id, carla.id, {
      startDate: '2026-12-10',
      endDate: '2026-12-10',
      status: 'in_progress',
    });
    await createTestReservation(item.id, dani.id, {
      startDate: '2026-12-31',
      endDate: '2027-01-02',
      status: 'accepted',
    });
    // Ni las pendientes ni las rechazadas, canceladas o finalizadas ocupan días.
    await createTestReservation(item.id, dani.id, {
      startDate: '2026-12-20',
      endDate: '2026-12-20',
      status: 'finished',
    });

    const response = await getDemand(
      item.id,
      DECEMBER,
      await loginAs('ana@rentit.test'),
    );

    expect(response.status).toBe(200);
    expect(response.body.bookedDays).toEqual([
      '2026-12-01',
      '2026-12-10',
      '2026-12-31',
    ]);
  });

  it('does not count pending requests on booked days, and drops requests that only touch them', async () => {
    const { ana, bruno, carla, dani } = await createUsers();
    const item = await createTestItem(ana.id);
    await createTestReservation(item.id, bruno.id, {
      startDate: '2026-12-05',
      endDate: '2026-12-06',
      status: 'accepted',
    });
    // carla pide del 4 al 6: solo cuenta el 4. dani pide el 5 y el 6, ya reservados: no cuenta.
    await createTestReservation(item.id, carla.id, {
      startDate: '2026-12-04',
      endDate: '2026-12-06',
    });
    await createTestReservation(item.id, dani.id, {
      startDate: '2026-12-05',
      endDate: '2026-12-06',
    });

    const response = await getDemand(
      item.id,
      DECEMBER,
      await loginAs('ana@rentit.test'),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: [{ date: '2026-12-04', pendingRequests: 1 }],
      pendingRequests: 1,
      bookedDays: ['2026-12-05', '2026-12-06'],
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
    const asOther = await getDemand(
      item.id,
      DECEMBER,
      await loginAs('bruno@rentit.test'),
    );

    expect(asOwner.status).toBe(200);
    expect(asOther.status).toBe(404);
    expect(asOther.body).toEqual(NOT_FOUND);
  });

  it('returns 404 for an item that does not exist or an id that is not a UUID', async () => {
    await createUsers();
    const token = await loginAs('ana@rentit.test');

    const missing = await getDemand(
      '00000000-0000-4000-8000-000000000000',
      DECEMBER,
      token,
    );
    const notUuid = await getDemand('abc', DECEMBER, token);

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(NOT_FOUND);
    expect(notUuid.status).toBe(404);
    expect(notUuid.body).toEqual(NOT_FOUND);
  });

  it('returns 400 when a date is missing or is not a real date', async () => {
    const { ana } = await createUsers();
    const item = await createTestItem(ana.id);

    const token = await loginAs('ana@rentit.test');

    const noFrom = await getDemand(item.id, { to: '2026-12-31' }, token);
    const badTo = await getDemand(
      item.id,
      { from: '2026-02-01', to: '2026-02-30' },
      token,
    );

    expect(noFrom.status).toBe(400);
    expect(noFrom.body.field).toBe('from');
    expect(badTo.status).toBe(400);
    expect(badTo.body.field).toBe('to');
  });

  it('returns 400 when the range ends before it starts or is longer than a year', async () => {
    const { ana } = await createUsers();
    const item = await createTestItem(ana.id);

    const token = await loginAs('ana@rentit.test');

    const reversed = await getDemand(
      item.id,
      { from: '2026-12-10', to: '2026-12-01' },
      token,
    );
    const tooLong = await getDemand(
      item.id,
      { from: '2026-01-01', to: '2027-01-02' },
      token,
    );

    expect(reversed.status).toBe(400);
    expect(reversed.body).toEqual({
      error: 'La fecha final no puede ser anterior a la fecha inicial.',
      field: 'to',
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.field).toBe('to');
  });

  it('returns 401 without a session', async () => {
    const { ana } = await createUsers();
    const item = await createTestItem(ana.id);

    const response = await request(app)
      .get(`/api/objetos/${item.id}/demanda`)
      .query(DECEMBER);

    expect(response.status).toBe(401);
  });
});
