import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { refund, release } from '../../src/services/paymentGateway.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import {
  createTestAdmin,
  createTestUser,
  TEST_PASSWORD,
} from '../helpers/users.js';

// Al retirar un objeto, el admin cancela sus solicitudes pendientes: hay que soltar el importe
// bloqueado en la tarjeta (US-11.03, #317, con el pago de US-07.01). La pasarela simulada de
// verdad, pero espiada.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 19/11/2026
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

async function setUp() {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const admin = await createTestAdmin();
  const item = await createTestItem(owner.id);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: TEST_PASSWORD });
  return { renter, item, token: login.body.token as string };
}

// `reference`: null = pago de demo sin pasarela, texto = pago con bloqueo en la tarjeta.
async function reservationWithPayment(
  itemId: string,
  renterId: string,
  options: {
    status: 'pending' | 'paid';
    paymentStatus: 'authorized' | 'paid';
    reference: string | null;
    startDate?: string;
  },
) {
  const startDate = options.startDate ?? '2099-01-10';
  return prisma.reservation.create({
    data: {
      itemId,
      renterId,
      startDate: new Date(startDate),
      endDate: new Date(startDate),
      totalPrice: 15,
      status: options.status,
      payment: {
        create: {
          rentalAmount: 15,
          depositAmount: 30,
          depositStatus: 'pending',
          status: options.paymentStatus,
          rentalReference: options.reference,
        },
      },
    },
  });
}

function withdraw(id: string, token: string) {
  return request(app)
    .post(`/api/admin/objetos/${id}/retirar`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'scam' });
}

async function state(id: string) {
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id },
    include: { payment: true },
  });
  return { status: reservation.status, payment: reservation.payment?.status };
}

describe('POST /api/admin/objetos/:id/retirar con pagos', () => {
  it('suelta el bloqueo de cada solicitud pendiente que cancela', async () => {
    const { renter, item, token } = await setUp();
    const first = await reservationWithPayment(item.id, renter.id, {
      status: 'pending',
      paymentStatus: 'authorized',
      reference: 'pi_retirada_1',
    });
    const second = await reservationWithPayment(item.id, renter.id, {
      status: 'pending',
      paymentStatus: 'authorized',
      reference: 'pi_retirada_2',
      startDate: '2099-02-10',
    });

    const response = await withdraw(item.id, token);

    expect(response.status).toBe(204);
    expect(await state(first.id)).toEqual({
      status: 'cancelled',
      payment: 'released',
    });
    expect(await state(second.id)).toEqual({
      status: 'cancelled',
      payment: 'released',
    });
    expect(
      vi
        .mocked(release)
        .mock.calls.map(([reference]) => reference)
        .sort(),
    ).toEqual(['pi_retirada_1', 'pi_retirada_2']);
  });

  it('un pago de demo sin pasarela se libera sin llamar a Stripe', async () => {
    const { renter, item, token } = await setUp();
    const demo = await reservationWithPayment(item.id, renter.id, {
      status: 'pending',
      paymentStatus: 'authorized',
      reference: null,
    });

    expect((await withdraw(item.id, token)).status).toBe(204);

    expect(await state(demo.id)).toEqual({
      status: 'cancelled',
      payment: 'released',
    });
    expect(release).not.toHaveBeenCalled();
  });

  it('no toca el pago de una reserva ya pagada', async () => {
    const { renter, item, token } = await setUp();
    const paid = await reservationWithPayment(item.id, renter.id, {
      status: 'paid',
      paymentStatus: 'paid',
      reference: 'pi_pagada',
    });

    expect((await withdraw(item.id, token)).status).toBe(204);

    expect(await state(paid.id)).toEqual({ status: 'paid', payment: 'paid' });
    expect(release).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it('si Stripe no responde, el objeto se retira igual y el bloqueo caduca solo', async () => {
    const { renter, item, token } = await setUp();
    const reservation = await reservationWithPayment(item.id, renter.id, {
      status: 'pending',
      paymentStatus: 'authorized',
      reference: 'pi_stripe_caido',
    });
    vi.mocked(release).mockRejectedValueOnce(new Error('Stripe caído'));

    const response = await withdraw(item.id, token);

    expect(response.status).toBe(204);
    expect(
      (await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).status,
    ).toBe('withdrawn');
    expect(await state(reservation.id)).toEqual({
      status: 'cancelled',
      payment: 'released',
    });
    expect(release).toHaveBeenCalledWith('pi_stripe_caido');
  });
});
