import type { DeliveryMode } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Seguimiento de la entrega (US-05.02, #288): un test por cada caso del contrato.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026

const CODE = '048213';

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// ana es la propietaria, bruno el arrendatario y rita la rider. La reserva está pagada y, con
// rider, rita ya ha aceptado el trabajo (eso lo hará US-10.01).
async function setUp(mode: DeliveryMode = 'rider') {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const rider = await createTestUser({
    username: 'rita',
    email: 'rita@rentit.test',
  });
  const item = await createTestItem(owner.id);
  const reservation = await createTestReservation(item.id, renter.id, {
    status: 'paid',
  });
  const withRider = mode === 'rider';
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      deliveryMode: mode,
      delivery: {
        create: withRider
          ? {
              riderId: rider.id,
              deliveryCode: CODE,
              status: 'assigned',
              assignedAt: new Date(),
            }
          : {},
      },
    },
  });

  return {
    reservation,
    rider,
    renterToken: await loginAs('bruno@rentit.test'),
    ownerToken: await loginAs('ana@rentit.test'),
    riderToken: await loginAs('rita@rentit.test'),
  };
}

function track(id: string, token?: string) {
  const call = request(app).get(`/api/entregas/${id}`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

describe('GET /api/entregas/:id', () => {
  it('shows the renter the rider steps in order and the delivery code', async () => {
    const { reservation, rider, renterToken } = await setUp();

    const response = await track(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reservationId: reservation.id,
      reservationStatus: 'paid',
      mode: 'rider',
      status: 'assigned',
      steps: [
        { status: 'assigned', at: expect.any(String) },
        { status: 'picked_up', at: null },
        { status: 'on_the_way', at: null },
        { status: 'delivered', at: null },
      ],
      returnedAt: null,
      rider: { id: rider.id, username: 'rita' },
      deliveryCode: CODE,
    });
  });

  it('never shows the code to the owner or the rider', async () => {
    const { reservation, ownerToken, riderToken } = await setUp();

    const asOwner = await track(reservation.id, ownerToken);
    const asRider = await track(reservation.id, riderToken);

    expect(asOwner.status).toBe(200);
    expect(asOwner.body.deliveryCode).toBeNull();
    expect(asRider.status).toBe(200);
    expect(asRider.body.deliveryCode).toBeNull();
  });

  it('hides the code once the object has been delivered', async () => {
    const { reservation, renterToken } = await setUp();
    await prisma.delivery.update({
      where: { reservationId: reservation.id },
      data: { status: 'delivered', deliveredAt: new Date() },
    });

    const response = await track(reservation.id, renterToken);

    expect(response.body.deliveryCode).toBeNull();
  });

  it.each(['home', 'pickup_point'] as const)(
    'with %s delivery the steps are pending and delivered, without code',
    async (mode) => {
      const { reservation, renterToken } = await setUp(mode);

      const response = await track(reservation.id, renterToken);

      expect(response.status).toBe(200);
      expect(response.body.steps).toEqual([
        { status: 'pending', at: null },
        { status: 'delivered', at: null },
      ]);
      expect(response.body.rider).toBeNull();
      expect(response.body.deliveryCode).toBeNull();
    },
  );

  it('returns 401 without a session', async () => {
    const { reservation } = await setUp();

    expect((await track(reservation.id)).status).toBe(401);
  });

  it('returns 403 to someone outside the reservation', async () => {
    const { reservation } = await setUp();
    await createTestUser({ username: 'carla', email: 'carla@rentit.test' });
    const token = await loginAs('carla@rentit.test');

    const response = await track(reservation.id, token);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error:
        'Solo las personas de esta reserva y su rider pueden ver la entrega.',
    });
  });

  it.each(['00000000-0000-0000-0000-000000000000', 'no-es-un-id'])(
    'returns 404 when the reservation %s does not exist',
    async (id) => {
      const { renterToken } = await setUp();

      expect((await track(id, renterToken)).status).toBe(404);
    },
  );

  it('returns 404 for a reservation without delivery (before US-05.01)', async () => {
    const { reservation, renterToken } = await setUp();
    const old = await createTestReservation(
      reservation.itemId,
      reservation.renterId,
      { startDate: '2026-12-20', endDate: '2026-12-21' },
    );

    const response = await track(old.id, renterToken);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'No hemos encontrado esta entrega.',
    });
  });
});
