import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { publish } from '../../src/services/realtimeService.js';
import { todayInSpain } from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Cancelar una reserva que ya tiene rider (US-04.05 con US-05.02 y US-10.01, #406): se avisa en
// tiempo real a las tres personas y el seguimiento la enseña cancelada. El canal de verdad, espiado.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 22/11/2026
vi.mock('../../src/services/realtimeService.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/realtimeService.js')
    >();
  return { ...actual, publish: vi.fn(actual.publish) };
});

beforeEach(async () => {
  await resetDb();
  vi.mocked(publish).mockClear();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

function daysFromToday(days: number): Date {
  const date = new Date(`${todayInSpain()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

// ana es la propietaria, bruno el arrendatario y rita la rider (si `withRider`). Pagada a 10 días,
// sin pasarela (referencias null): cancelar es gratis y no llama a Stripe.
async function setUp(withRider: boolean) {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const rider = await createTestUser({
    username: 'rita',
    email: 'rita@rentit.test',
  });
  const item = await createTestItem(owner.id, { riderDelivery: true });
  const reservation = await prisma.reservation.create({
    data: {
      itemId: item.id,
      renterId: renter.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(11),
      totalPrice: 20,
      status: 'paid',
      deliveryMode: withRider ? 'rider' : 'home',
      payment: {
        create: {
          rentalAmount: 20,
          depositAmount: 30,
          status: 'paid',
          depositStatus: 'pending',
        },
      },
      delivery: {
        create: withRider
          ? {
              riderId: rider.id,
              status: 'assigned',
              assignedAt: new Date(),
              deliveryCode: '048213',
            }
          : {},
      },
    },
  });
  return {
    reservation,
    owner,
    renter,
    rider,
    renterToken: await loginAs('bruno@rentit.test'),
    riderToken: await loginAs('rita@rentit.test'),
  };
}

function cancel(id: string, token: string) {
  return request(app)
    .post(`/api/reservas/${id}/cancelar`)
    .set('Authorization', `Bearer ${token}`);
}

describe('cancelar una reserva con rider asignado (#406)', () => {
  it('avisa al arrendatario, al propietario y al rider', async () => {
    const { reservation, owner, renter, rider, renterToken } =
      await setUp(true);

    expect((await cancel(reservation.id, renterToken)).status).toBe(200);

    expect(publish).toHaveBeenCalledTimes(1);
    const [userIds, type, data] = vi.mocked(publish).mock.calls[0]!;
    expect([...userIds].sort()).toEqual([renter.id, owner.id, rider.id].sort());
    expect(type).toBe('entrega.estado');
    expect(data).toEqual({
      reservationId: reservation.id,
      status: 'cancelled',
      at: expect.any(String),
    });
  });

  it('sin rider, avisa solo al arrendatario y al propietario', async () => {
    const { reservation, owner, renter, renterToken } = await setUp(false);

    expect((await cancel(reservation.id, renterToken)).status).toBe(200);

    const [userIds] = vi.mocked(publish).mock.calls[0]!;
    expect([...userIds].sort()).toEqual([renter.id, owner.id].sort());
  });

  it('si no se puede cancelar, no avisa a nadie', async () => {
    const { reservation, renterToken } = await setUp(true);
    await cancel(reservation.id, renterToken);
    vi.mocked(publish).mockClear();

    expect((await cancel(reservation.id, renterToken)).status).toBe(409);
    expect(publish).not.toHaveBeenCalled();
  });

  it('el rider ve el seguimiento cancelado y ya no puede avanzar', async () => {
    const { reservation, renterToken, riderToken } = await setUp(true);
    await cancel(reservation.id, renterToken);

    const tracking = await request(app)
      .get(`/api/entregas/${reservation.id}`)
      .set('Authorization', `Bearer ${riderToken}`);
    expect(tracking.status).toBe(200);
    expect(tracking.body.reservationStatus).toBe('cancelled');

    const advance = await request(app)
      .post(`/api/entregas/${reservation.id}/estado`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'picked_up' });
    expect(advance.status).toBe(409);
  });
});
