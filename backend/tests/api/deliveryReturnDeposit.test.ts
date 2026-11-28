import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { refund, release } from '../../src/services/paymentGateway.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Fianza al devolver (#402, US-07.01 con el seguimiento de US-05.02). Desde US-09.01 (#456) no se
// libera al marcar «He devuelto el objeto»: se queda 48 h por si el propietario abre una incidencia,
// y después se libera o se devuelve al leer «Mis solicitudes». La pasarela simulada de verdad, pero
// espiada.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 22/11/2026; cambiado por Marc
// Sanz (US-09.01), 28/11/2026
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

// Lleva la devolución `hours` horas atrás, como si hubiera pasado ese tiempo.
async function returnedHoursAgo(reservationId: string, hours: number) {
  await prisma.delivery.update({
    where: { reservationId },
    data: { returnedAt: new Date(Date.now() - hours * 60 * 60 * 1000) },
  });
}

// Lo que hace la app al abrir «Mis solicitudes»: ahí se liberan las fianzas que toca.
async function readMyReservations(token: string) {
  const response = await request(app)
    .get('/api/usuarios/me/reservas')
    .set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(200);
  return response;
}

describe('POST /api/entregas/:id/devuelta con fianza (#402, US-09.01)', () => {
  it('al devolver, la reserva se finaliza pero la fianza sigue retenida, sin llamar a Stripe', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'held',
      depositReference: 'pi_fianza',
    });

    expect((await returned(reservation.id, token)).status).toBe(200);
    await readMyReservations(token);

    expect(await state(reservation.id)).toEqual({
      status: 'finished',
      deposit: 'held',
    });
    expect(release).not.toHaveBeenCalled();
  });
});

describe('fianza 48 h después de la devolución (US-09.01, #456)', () => {
  it('libera en Stripe la fianza retenida y la marca «liberada»', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'held',
      depositReference: 'pi_fianza',
    });
    await returned(reservation.id, token);
    await returnedHoursAgo(reservation.id, 49);

    await readMyReservations(token);

    expect(await state(reservation.id)).toEqual({
      status: 'finished',
      deposit: 'released',
    });
    expect(release).toHaveBeenCalledWith('pi_fianza');
    expect(refund).not.toHaveBeenCalled();
  });

  it('todavía no la libera a las 47 h', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'held',
      depositReference: 'pi_fianza',
    });
    await returned(reservation.id, token);
    await returnedHoursAgo(reservation.id, 47);

    await readMyReservations(token);

    expect((await state(reservation.id)).deposit).toBe('held');
    expect(release).not.toHaveBeenCalled();
  });

  it('devuelve la fianza cobrada (más de 6 días) y la marca «devuelta»', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'collected',
      depositReference: 'pi_fianza',
    });
    await returned(reservation.id, token);
    await returnedHoursAgo(reservation.id, 49);

    await readMyReservations(token);

    expect((await state(reservation.id)).deposit).toBe('returned');
    expect(refund).toHaveBeenCalledWith('pi_fianza');
    expect(release).not.toHaveBeenCalled();
  });

  it('una fianza que no llegó a retenerse queda «liberada» sin llamar a Stripe', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'pending',
      depositReference: null,
    });
    await returned(reservation.id, token);
    await returnedHoursAgo(reservation.id, 49);

    await readMyReservations(token);

    expect((await state(reservation.id)).deposit).toBe('released');
    expect(release).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it('una fianza retenida de un pago de demo (sin referencia) se libera sin llamar a Stripe', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'held',
      depositReference: null,
    });
    await returned(reservation.id, token);
    await returnedHoursAgo(reservation.id, 49);

    await readMyReservations(token);

    expect((await state(reservation.id)).deposit).toBe('released');
    expect(release).not.toHaveBeenCalled();
  });

  it('una fianza ejecutada por daños no se toca', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'charged',
      depositReference: 'pi_fianza',
    });
    await returned(reservation.id, token);
    await returnedHoursAgo(reservation.id, 49);

    await readMyReservations(token);

    expect((await state(reservation.id)).deposit).toBe('charged');
    expect(release).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it('con una incidencia abierta no la libera aunque pasen las 48 h', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'held',
      depositReference: 'pi_fianza',
    });
    await returned(reservation.id, token);
    const item = await prisma.item.findFirstOrThrow();
    await prisma.incident.create({
      data: {
        reservationId: reservation.id,
        openedById: item.ownerId,
        type: 'damage',
        description: 'Ha vuelto con una rueda pinchada.',
      },
    });
    await returnedHoursAgo(reservation.id, 72);

    await readMyReservations(token);

    expect((await state(reservation.id)).deposit).toBe('held');
    expect(release).not.toHaveBeenCalled();
  });

  it('si Stripe falla, la fianza sigue retenida y se reintenta en la siguiente lectura', async () => {
    const { reservation, token } = await inProgress({
      depositStatus: 'held',
      depositReference: 'pi_fianza',
    });
    await returned(reservation.id, token);
    await returnedHoursAgo(reservation.id, 49);
    vi.mocked(release).mockRejectedValueOnce(new Error('Stripe caído'));

    await readMyReservations(token);
    expect((await state(reservation.id)).deposit).toBe('held');

    await readMyReservations(token);
    expect((await state(reservation.id)).deposit).toBe('released');
    expect(release).toHaveBeenCalledTimes(2);
  });
});
