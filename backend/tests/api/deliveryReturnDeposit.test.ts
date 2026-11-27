import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { refund, release } from '../../src/services/paymentGateway.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { confirmDeliveryPhotos } from '../helpers/statePhotos.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Al marcar «He devuelto el objeto», la fianza se libera o se devuelve (#402, último criterio de
// US-07.01 con el seguimiento de US-05.02). La pasarela simulada de verdad, pero espiada.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 22/11/2026
vi.mock('../../src/services/paymentGateway.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/paymentGateway.js')
    >();
  return {
    ...actual,
    release: vi.fn(actual.release),
    refund: vi.fn(actual.refund),
  };
});

beforeEach(async () => {
  await resetDb();
  vi.mocked(release).mockClear();
  vi.mocked(refund).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

type Deposit = {
  depositStatus: 'pending' | 'held' | 'collected' | 'charged';
  depositReference: string | null;
};

// Reserva pagada con recogida en casa de ana; bruno ya ha marcado «Ya tengo el objeto», así que
// está «En curso». La fianza, como se pida.
async function inProgress(deposit: Deposit) {
  const owner = await createTestUser();
  await createTestUser({ username: 'bruno', email: 'bruno@rentit.test' });
  const renter = await prisma.user.findFirstOrThrow({
    where: { email: 'bruno@rentit.test' },
  });
  const item = await createTestItem(owner.id, { homeDelivery: true });
  const reservation = await createTestReservation(item.id, renter.id, {
    status: 'paid',
  });
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      deliveryMode: 'home',
      delivery: { create: {} },
      payment: {
        create: {
          rentalAmount: 15,
          depositAmount: 30,
          status: 'paid',
          rentalReference: 'pi_alquiler',
          ...deposit,
        },
      },
    },
  });
  await confirmDeliveryPhotos(reservation.id, owner.id);
  const token = await loginAs('bruno@rentit.test');
  const received = await request(app)
    .post(`/api/entregas/${reservation.id}/recibida`)
    .set('Authorization', `Bearer ${token}`);
  expect(received.status).toBe(200);
  return { reservation, token };
}

function returned(id: string, token: string) {
  return request(app)
    .post(`/api/entregas/${id}/devuelta`)
    .set('Authorization', `Bearer ${token}`);
}

async function state(reservationId: string) {
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { payment: true },
  });
  return {
    status: reservation.status,
    deposit: reservation.payment?.depositStatus,
  };
}

describe('POST /api/entregas/:id/devuelta con fianza (#402)', () => {
  it('libera en Stripe la fianza retenida y la marca «liberada»', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'held',
      depositReference: 'pi_fianza',
    });

    expect((await returned(reservation.id, token)).status).toBe(200);

    expect(await state(reservation.id)).toEqual({
      status: 'finished',
      deposit: 'released',
    });
    expect(release).toHaveBeenCalledWith('pi_fianza');
    expect(refund).not.toHaveBeenCalled();
  });

  it('devuelve la fianza cobrada (más de 6 días) y la marca «devuelta»', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'collected',
      depositReference: 'pi_fianza',
    });

    expect((await returned(reservation.id, token)).status).toBe(200);

    expect(await state(reservation.id)).toEqual({
      status: 'finished',
      deposit: 'returned',
    });
    expect(refund).toHaveBeenCalledWith('pi_fianza');
    expect(release).not.toHaveBeenCalled();
  });

  it('una fianza que no llegó a retenerse queda «liberada» sin llamar a Stripe', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'pending',
      depositReference: null,
    });

    expect((await returned(reservation.id, token)).status).toBe(200);

    expect((await state(reservation.id)).deposit).toBe('released');
    expect(release).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it('una fianza retenida de un pago de demo (sin referencia) se libera sin llamar a Stripe', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'held',
      depositReference: null,
    });

    expect((await returned(reservation.id, token)).status).toBe(200);

    expect((await state(reservation.id)).deposit).toBe('released');
    expect(release).not.toHaveBeenCalled();
  });

  it('una fianza ejecutada por daños no se toca', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'charged',
      depositReference: 'pi_fianza',
    });

    expect((await returned(reservation.id, token)).status).toBe(200);

    expect((await state(reservation.id)).deposit).toBe('charged');
    expect(release).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it('si Stripe falla, no se finaliza nada y se puede reintentar', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'held',
      depositReference: 'pi_fianza',
    });
    vi.mocked(release).mockRejectedValueOnce(new Error('Stripe caído'));

    const response = await returned(reservation.id, token);

    expect(response.status).toBe(502);
    expect(response.body.error).toBe(
      'No se ha podido liberar la fianza. Inténtalo de nuevo.',
    );
    expect(await state(reservation.id)).toEqual({
      status: 'in_progress',
      deposit: 'held',
    });

    expect((await returned(reservation.id, token)).status).toBe(200);
    expect(await state(reservation.id)).toEqual({
      status: 'finished',
      deposit: 'released',
    });
  });
});
