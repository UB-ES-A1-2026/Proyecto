import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import {
  NOT_FOUND_MESSAGE,
  NOT_OWNER_MESSAGE,
  NOT_PENDING_MESSAGE,
  OVERLAPPING_MESSAGE,
} from '../../src/services/reservationDecisionService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Aceptar y rechazar solicitudes (US-04.03 y US-04.04, #125): contrato del issue y casos de
// QA CP-ACE-02/03/04 y CP-REC-02/03/04.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 02/11/2026

const ACTIONS = [
  ['aceptar', 'accepted'],
  ['rechazar', 'rejected'],
] as const;

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// ana es la propietaria y bruno el que solicita.
async function pendingRequest() {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(owner.id);
  const reservation = await createTestReservation(item.id, renter.id);

  return {
    owner,
    renter,
    item,
    reservation,
    ownerToken: await loginAs('ana@rentit.test'),
    renterToken: await loginAs('bruno@rentit.test'),
  };
}

function decide(action: string, id: string, token?: string) {
  const call = request(app).post(`/api/reservas/${id}/${action}`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

async function statusOf(id: string) {
  return (await prisma.reservation.findUniqueOrThrow({ where: { id } })).status;
}

describe.each(ACTIONS)('POST /api/reservas/:id/%s', (action, finalStatus) => {
  it('el propietario responde y recibe la reserva completa actualizada', async () => {
    const { reservation, item, owner, renter, ownerToken } =
      await pendingRequest();

    const response = await decide(action, reservation.id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: reservation.id,
      item: { id: item.id, title: item.title },
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      totalPrice: '15.00',
      status: finalStatus,
      renter: { id: renter.id, username: 'bruno' },
      owner: { id: owner.id, username: 'ana' },
      createdAt: reservation.createdAt.toISOString(),
    });
    expect(await statusOf(reservation.id)).toBe(finalStatus);
  });

  it('exige sesión', async () => {
    const { reservation } = await pendingRequest();

    const response = await decide(action, reservation.id);

    expect(response.status).toBe(401);
    expect(await statusOf(reservation.id)).toBe('pending');
  });

  it('responde 403 si no eres el propietario, aunque seas quien la pidió', async () => {
    const { reservation, renterToken } = await pendingRequest();

    const response = await decide(action, reservation.id, renterToken);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: NOT_OWNER_MESSAGE });
    expect(await statusOf(reservation.id)).toBe('pending');
  });

  it.each(['no-es-un-uuid', '00000000-0000-4000-8000-000000000000'])(
    'responde 404 si la solicitud %s no existe',
    async (id) => {
      const { ownerToken } = await pendingRequest();

      const response = await decide(action, id, ownerToken);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: NOT_FOUND_MESSAGE });
    },
  );

  it.each([
    'accepted',
    'rejected',
    'cancelled',
    'paid',
    'in_progress',
    'finished',
  ] as const)(
    'responde 409 si ya está en %s y no la cambia',
    async (status) => {
      const { owner, renter, ownerToken } = await pendingRequest();
      const otherItem = await createTestItem(owner.id, { title: 'Otro' });
      const decided = await createTestReservation(otherItem.id, renter.id, {
        status,
      });

      const response = await decide(action, decided.id, ownerToken);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: NOT_PENDING_MESSAGE });
      expect(await statusOf(decided.id)).toBe(status);
    },
  );
});

describe('aceptar: fechas solapadas', () => {
  it.each([
    ['accepted', '2026-12-03', '2026-12-05'],
    ['paid', '2026-11-29', '2026-12-01'],
    ['in_progress', '2026-12-02', '2026-12-02'],
  ] as const)(
    'responde 409 si se solapa con una reserva %s y sigue pendiente',
    async (status, startDate, endDate) => {
      const { item, renter, reservation, ownerToken } = await pendingRequest();
      await createTestReservation(item.id, renter.id, {
        status,
        startDate,
        endDate,
      });

      const response = await decide('aceptar', reservation.id, ownerToken);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: OVERLAPPING_MESSAGE,
        field: 'startDate',
      });
      expect(await statusOf(reservation.id)).toBe('pending');
    },
  );

  it.each([
    ['pending', '2026-12-01', '2026-12-03'],
    ['rejected', '2026-12-01', '2026-12-03'],
    ['cancelled', '2026-12-01', '2026-12-03'],
    ['accepted', '2026-12-04', '2026-12-06'],
  ] as const)(
    'deja aceptar si la otra reserva está en %s del %s al %s',
    async (status, startDate, endDate) => {
      const { item, renter, reservation, ownerToken } = await pendingRequest();
      await createTestReservation(item.id, renter.id, {
        status,
        startDate,
        endDate,
      });

      const response = await decide('aceptar', reservation.id, ownerToken);

      expect(response.status).toBe(200);
    },
  );

  it('las reservas de otro objeto no molestan', async () => {
    const { owner, renter, reservation, ownerToken } = await pendingRequest();
    const otherItem = await createTestItem(owner.id, { title: 'Otro' });
    await createTestReservation(otherItem.id, renter.id, {
      status: 'accepted',
    });

    const response = await decide('aceptar', reservation.id, ownerToken);

    expect(response.status).toBe(200);
  });

  it('rechazar no comprueba fechas: siempre se puede decir que no', async () => {
    const { item, renter, reservation, ownerToken } = await pendingRequest();
    await createTestReservation(item.id, renter.id, { status: 'accepted' });

    const response = await decide('rechazar', reservation.id, ownerToken);

    expect(response.status).toBe(200);
  });
});

describe('peticiones a la vez', () => {
  it('aceptar dos solicitudes solapadas: solo gana una', async () => {
    const { item, renter, reservation, ownerToken } = await pendingRequest();
    const second = await createTestReservation(item.id, renter.id);

    const responses = await Promise.all([
      decide('aceptar', reservation.id, ownerToken),
      decide('aceptar', second.id, ownerToken),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      await prisma.reservation.count({ where: { status: 'accepted' } }),
    ).toBe(1);
  });

  it('aceptar y rechazar la misma solicitud: solo cuenta una respuesta', async () => {
    const { reservation, ownerToken } = await pendingRequest();

    const responses = await Promise.all([
      decide('aceptar', reservation.id, ownerToken),
      decide('rechazar', reservation.id, ownerToken),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const winner = responses.find(({ status }) => status === 200);
    expect(await statusOf(reservation.id)).toBe(winner?.body.status);
  });
});
