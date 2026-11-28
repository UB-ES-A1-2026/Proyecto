import type { ReservationStatus } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Abrir una incidencia como propietario (US-09.01, #76, tarea #456).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 28/11/2026

const HOUR = 60 * 60 * 1000;
const VALID = {
  type: 'damage',
  description: 'Ha vuelto con el cable cortado.',
};
const OUT_OF_TIME =
  'Solo se puede abrir una incidencia con el alquiler en curso o en las 48 h siguientes a la devolución.';

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// ana alquila su objeto a bruno. Por defecto está «En curso», con la fianza retenida.
// `returnedHoursAgo`: finalizada y devuelta hace esas horas.
async function setUp({
  status = 'in_progress',
  returnedHoursAgo,
  depositStatus = 'held',
}: {
  status?: ReservationStatus;
  returnedHoursAgo?: number;
  depositStatus?: 'held' | 'released' | 'pending';
} = {}) {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  await createTestUser({ username: 'carla', email: 'carla@rentit.test' });
  const item = await createTestItem(owner.id, { homeDelivery: true });
  const finished = returnedHoursAgo !== undefined;
  const reservation = await createTestReservation(item.id, renter.id, {
    status: finished ? 'finished' : status,
  });
  const delivered = finished || status === 'in_progress';
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      deliveryMode: 'home',
      delivery: {
        create: delivered
          ? {
              status: 'delivered',
              deliveredAt: new Date(Date.now() - 72 * HOUR),
              returnedAt: finished
                ? new Date(Date.now() - returnedHoursAgo * HOUR)
                : null,
            }
          : {},
      },
      payment: {
        create: {
          rentalAmount: 15,
          depositAmount: 30,
          status: 'paid',
          depositStatus,
          depositReference: depositStatus === 'held' ? 'pi_fianza' : null,
        },
      },
    },
  });

  return {
    id: reservation.id,
    owner,
    ownerToken: await loginAs('ana@rentit.test'),
    renterToken: await loginAs('bruno@rentit.test'),
    strangerToken: await loginAs('carla@rentit.test'),
  };
}

function open(id: string, token: string | null, body: unknown = VALID) {
  const call = request(app)
    .post(`/api/reservas/${id}/incidencia`)
    .send(body as object);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

describe('POST /api/reservas/:id/incidencia', () => {
  it('lets the owner open an incident with the rental in progress', async () => {
    const { id, owner, ownerToken } = await setUp();

    const response = await open(id, ownerToken);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      type: 'damage',
      description: 'Ha vuelto con el cable cortado.',
      status: 'open',
      createdAt: expect.any(String),
    });
    const saved = await prisma.incident.findUniqueOrThrow({
      where: { reservationId: id },
    });
    expect(saved).toMatchObject({ openedById: owner.id, status: 'open' });
  });

  it.each(['late_return', 'no_return'])(
    'accepts the type %s and trims the description',
    async (type) => {
      const { id, ownerToken } = await setUp();

      const response = await open(id, ownerToken, {
        type,
        description: '   No lo ha devuelto.   ',
      });

      expect(response.status).toBe(201);
      expect(response.body.description).toBe('No lo ha devuelto.');
    },
  );

  it('lets the owner open it up to 48 h after the return', async () => {
    const { id, ownerToken } = await setUp({ returnedHoursAgo: 47 });

    expect((await open(id, ownerToken)).status).toBe(201);
  });

  it('returns 409 more than 48 h after the return', async () => {
    const { id, ownerToken } = await setUp({ returnedHoursAgo: 49 });

    const response = await open(id, ownerToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: OUT_OF_TIME });
  });

  it('returns 409 before the rental starts', async () => {
    const { id, ownerToken } = await setUp({ status: 'paid' });

    const response = await open(id, ownerToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: OUT_OF_TIME });
  });

  it('returns 409 if the deposit was already released (object back in good state)', async () => {
    const { id, ownerToken } = await setUp({
      returnedHoursAgo: 2,
      depositStatus: 'released',
    });

    const response = await open(id, ownerToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: OUT_OF_TIME });
    expect(await prisma.incident.count()).toBe(0);
  });

  it('returns 409 for a second incident in the same rental', async () => {
    const { id, ownerToken } = await setUp();
    await open(id, ownerToken);

    const response = await open(id, ownerToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Este alquiler ya tiene una incidencia.',
    });
  });

  it.each([
    ['without type', { description: 'Roto.' }],
    ['with an unknown type', { type: 'otro', description: 'Roto.' }],
  ])('returns 400 %s', async (_, body) => {
    const { id, ownerToken } = await setUp();

    const response = await open(id, ownerToken, body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Elige el tipo de incidencia.',
      field: 'type',
    });
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['too long', 'a'.repeat(2001)],
  ])('returns 400 with a description %s', async (_, description) => {
    const { id, ownerToken } = await setUp();

    const response = await open(id, ownerToken, {
      type: 'damage',
      description,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'El campo "descripción" no es correcto, revísalo.',
      field: 'description',
    });
  });

  it.each([
    ['the renter', 'renterToken'],
    ['someone outside the rental', 'strangerToken'],
  ] as const)('returns 403 to %s', async (_, who) => {
    const users = await setUp();

    const response = await open(users.id, users[who]);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Solo el propietario puede abrir una incidencia de este alquiler.',
    });
  });

  it('returns 404 for a rental that does not exist and 401 without a session', async () => {
    const { id, ownerToken } = await setUp();

    expect(
      (await open('00000000-0000-4000-8000-000000000000', ownerToken)).status,
    ).toBe(404);
    expect((await open('no-es-un-id', ownerToken)).status).toBe(404);
    expect((await open(id, null)).status).toBe(401);
  });
});

describe('«Mis solicitudes» con incidencias (US-09.01)', () => {
  async function myReservations(token: string) {
    const response = await request(app)
      .get('/api/usuarios/me/reservas')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    return response.body as {
      sent: Record<string, unknown>[];
      received: Record<string, unknown>[];
    };
  }

  it('only the owner can open one, and only in time', async () => {
    const { ownerToken, renterToken } = await setUp();

    const owner = await myReservations(ownerToken);
    const renter = await myReservations(renterToken);

    expect(owner.received[0]).toMatchObject({
      incident: null,
      canOpenIncident: true,
      depositStatus: 'held',
    });
    expect(renter.sent[0]).toMatchObject({
      incident: null,
      canOpenIncident: false,
    });
  });

  it('after opening it, both see the incident and the deposit stays held', async () => {
    const { id, ownerToken, renterToken } = await setUp({
      returnedHoursAgo: 1,
    });
    await open(id, ownerToken);

    const owner = await myReservations(ownerToken);
    const renter = await myReservations(renterToken);

    for (const reservation of [owner.received[0], renter.sent[0]]) {
      expect(reservation).toMatchObject({
        incident: {
          id: expect.any(String),
          type: 'damage',
          status: 'open',
          createdAt: expect.any(String),
        },
        canOpenIncident: false,
        depositStatus: 'held',
      });
    }
  });

  it('more than 48 h after the return the button is gone', async () => {
    const { ownerToken } = await setUp({ returnedHoursAgo: 49 });

    const owner = await myReservations(ownerToken);

    expect(owner.received[0]!.canOpenIncident).toBe(false);
  });
});
