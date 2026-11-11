import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import {
  ALREADY_PAID_MESSAGE,
  MISSING_CARD_MESSAGE,
  NOT_ACCEPTED_MESSAGE,
  NOT_FOUND_MESSAGE,
  NOT_RENTER_MESSAGE,
} from '../../src/services/paymentService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Registrar un pago (US-07.01 #72, T9 #284): criterios de aceptación de la historia.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 11/11/2026

const VALID_CARD = 'pm_card_visa';
const DECLINED_CARD = 'pm_card_chargeDeclined';

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// ana es la propietaria y bruno el arrendatario. Alquiler de 15 € y fianza de 30 €.
async function reservationWithStatus(
  status: 'pending' | 'accepted' | 'rejected' | 'paid' = 'accepted',
) {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(owner.id, { deposit: 30 });
  const reservation = await createTestReservation(item.id, renter.id, {
    totalPrice: 15,
    status,
  });

  return {
    reservation,
    ownerToken: await loginAs('ana@rentit.test'),
    renterToken: await loginAs('bruno@rentit.test'),
  };
}

function pay(id: string, token?: string, paymentMethodId: unknown = VALID_CARD) {
  const call = request(app).post(`/api/reservas/${id}/pago`).send({ paymentMethodId });
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

async function statusOf(id: string) {
  return (await prisma.reservation.findUniqueOrThrow({ where: { id } })).status;
}

describe('POST /api/reservas/:id/pago', () => {
  it('con una tarjeta válida registra el pago, retiene la fianza y la reserva pasa a «pagada»', async () => {
    const { reservation, renterToken } = await reservationWithStatus();

    const response = await pay(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: reservation.id, status: 'paid' });

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(payment.status).toBe('paid');
    expect(payment.depositStatus).toBe('held');
    expect(payment.rentalAmount.toFixed(2)).toBe('15.00');
    expect(payment.depositAmount.toFixed(2)).toBe('30.00');
    expect(payment.deliveryAmount.toFixed(2)).toBe('0.00');
    expect(payment.gatewayReference).toBeTruthy();
  });

  it('si la tarjeta es rechazada, la reserva no cambia y se devuelve el error', async () => {
    const { reservation, renterToken } = await reservationWithStatus();

    const response = await pay(reservation.id, renterToken, DECLINED_CARD);

    expect(response.status).toBe(402);
    expect(response.body).toEqual({
      error: 'Tu tarjeta ha sido rechazada.',
      field: 'paymentMethodId',
    });
    expect(await statusOf(reservation.id)).toBe('accepted');
    expect(await prisma.payment.count()).toBe(0);
  });

  it('una reserva ya pagada no se vuelve a cobrar', async () => {
    const { reservation, renterToken } = await reservationWithStatus();

    await pay(reservation.id, renterToken);
    const response = await pay(reservation.id, renterToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: ALREADY_PAID_MESSAGE });
    expect(await prisma.payment.count()).toBe(1);
  });

  it.each(['pending', 'rejected'] as const)(
    'no se puede pagar una solicitud «%s»',
    async (status) => {
      const { reservation, renterToken } = await reservationWithStatus(status);

      const response = await pay(reservation.id, renterToken);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: NOT_ACCEPTED_MESSAGE });
      expect(await statusOf(reservation.id)).toBe(status);
    },
  );

  it('solo el arrendatario puede pagar', async () => {
    const { reservation, ownerToken } = await reservationWithStatus();

    const response = await pay(reservation.id, ownerToken);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: NOT_RENTER_MESSAGE });
    expect(await statusOf(reservation.id)).toBe('accepted');
  });

  it('exige sesión', async () => {
    const { reservation } = await reservationWithStatus();

    const response = await pay(reservation.id);

    expect(response.status).toBe(401);
    expect(await statusOf(reservation.id)).toBe('accepted');
  });

  it.each(['00000000-0000-0000-0000-000000000000', 'no-es-un-uuid'])(
    'devuelve 404 si la reserva no existe (%s)',
    async (id) => {
      const { renterToken } = await reservationWithStatus();

      const response = await pay(id, renterToken);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: NOT_FOUND_MESSAGE });
    },
  );

  it('pide los datos de la tarjeta', async () => {
    const { reservation, renterToken } = await reservationWithStatus();

    const response = await pay(reservation.id, renterToken, '');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: MISSING_CARD_MESSAGE,
      field: 'paymentMethodId',
    });
    expect(await statusOf(reservation.id)).toBe('accepted');
  });
});
