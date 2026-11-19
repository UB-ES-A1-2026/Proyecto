import type { DepositStatus, ReservationStatus } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import {
  CANCEL_FAILED_MESSAGE,
  NOT_CANCELLABLE_MESSAGE,
} from '../../src/services/cancellationService.js';
import { refund, release } from '../../src/services/paymentGateway.js';
import { todayInSpain } from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Cancelar una reserva con penalización (US-04.05, #308 y #64). La pasarela simulada de verdad,
// pero espiada.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026
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

const HOUR_MS = 60 * 60 * 1000;

function daysFromToday(days: number): string {
  const date = new Date(`${todayInSpain()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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

async function setUp() {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const stranger = await createTestUser({
    username: 'carla',
    email: 'carla@rentit.test',
  });
  const item = await createTestItem(owner.id);
  return {
    owner,
    renter,
    item,
    ownerToken: await loginAs('ana@rentit.test'),
    renterToken: await loginAs('bruno@rentit.test'),
    strangerToken: await loginAs(stranger.email),
  };
}

interface ReservationOptions {
  status?: ReservationStatus;
  startInDays?: number;
  endInDays?: number;
  expiresInMs?: number | null;
  // undefined = sin fila de pago (flujo antiguo).
  payment?: {
    status?: 'authorized' | 'paid';
    delivery?: number;
    depositStatus?: DepositStatus | null;
    rentalReference?: string | null;
    depositReference?: string | null;
  };
}

// Reserva de 20 € de alquiler (y 30 € de fianza si hay pago). Por defecto, pagada y a 5 días.
async function createReservation(
  itemId: string,
  renterId: string,
  options: ReservationOptions = {},
) {
  const status = options.status ?? 'paid';
  const startInDays = options.startInDays ?? 5;
  const reservation = await prisma.reservation.create({
    data: {
      itemId,
      renterId,
      startDate: new Date(daysFromToday(startInDays)),
      endDate: new Date(daysFromToday(options.endInDays ?? startInDays + 1)),
      totalPrice: 20,
      status,
      expiresAt:
        status === 'pending'
          ? new Date(Date.now() + (options.expiresInMs ?? 40 * HOUR_MS))
          : null,
    },
  });
  if (options.payment) {
    const payment = options.payment;
    await prisma.payment.create({
      data: {
        reservationId: reservation.id,
        rentalAmount: 20,
        deliveryAmount: payment.delivery ?? 0,
        depositAmount: payment.depositStatus === null ? 0 : 30,
        status:
          payment.status ?? (status === 'pending' ? 'authorized' : 'paid'),
        depositStatus:
          payment.depositStatus === undefined ? 'held' : payment.depositStatus,
        rentalReference:
          payment.rentalReference === undefined
            ? 'alquiler_ref'
            : payment.rentalReference,
        depositReference:
          payment.depositReference === undefined
            ? 'fianza_ref'
            : payment.depositReference,
      },
    });
  }
  return reservation;
}

function cancel(id: string, token: string) {
  return request(app)
    .post(`/api/reservas/${id}/cancelar`)
    .set('Authorization', `Bearer ${token}`);
}

function preview(id: string, token: string) {
  return request(app)
    .get(`/api/reservas/${id}/cancelacion`)
    .set('Authorization', `Bearer ${token}`);
}

async function stored(id: string) {
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id },
    include: { payment: true, cancellation: true },
  });
  return {
    status: reservation.status,
    payment: reservation.payment?.status,
    deposit: reservation.payment?.depositStatus,
    cancellation: reservation.cancellation,
  };
}

describe('GET /api/reservas/:id/cancelacion', () => {
  it('arrendatario de una pagada a 5 días: 35 %, descuenta la penalización y deja la entrega entera', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: { delivery: 3 },
    });

    const response = await preview(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      daysUntilStart: 5,
      penaltyPercent: 35,
      penaltyAmount: '7.00',
      refundAmount: '16.00',
      free: false,
      releasesHold: false,
    });
    expect(await stored(reservation.id)).toMatchObject({ status: 'paid' });
  });

  it('propietario de la misma reserva: misma penalización, pero se devuelve todo al arrendatario', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: { delivery: 3 },
    });

    const response = await preview(reservation.id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      penaltyPercent: 35,
      penaltyAmount: '7.00',
      refundAmount: '23.00',
      free: false,
    });
  });

  it('pendiente con el importe bloqueado: gratis y se libera el bloqueo', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      status: 'pending',
      startInDays: 1,
      payment: {},
    });

    const response = await preview(reservation.id, renterToken);

    expect(response.body).toEqual({
      daysUntilStart: 1,
      penaltyPercent: 0,
      penaltyAmount: '0.00',
      refundAmount: '0.00',
      free: true,
      releasesHold: true,
    });
  });

  it('aceptada del flujo anterior (sin pago): gratis y sin bloqueo', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      status: 'accepted',
      startInDays: 1,
    });

    const response = await preview(reservation.id, renterToken);

    expect(response.body).toMatchObject({
      penaltyPercent: 0,
      refundAmount: '0.00',
      free: true,
      releasesHold: false,
    });
  });

  it('401 sin sesión', async () => {
    const { item, renter } = await setUp();
    const reservation = await createReservation(item.id, renter.id);

    const response = await request(app).get(
      `/api/reservas/${reservation.id}/cancelacion`,
    );

    expect(response.status).toBe(401);
  });

  it('403 si no es de la reserva y 404 si no existe', async () => {
    const { item, renter, strangerToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id);

    expect((await preview(reservation.id, strangerToken)).status).toBe(403);
    expect(
      (await preview('00000000-0000-4000-8000-000000000000', strangerToken))
        .status,
    ).toBe(404);
    expect((await preview('no-es-un-uuid', strangerToken)).status).toBe(404);
  });

  it('409 si el propietario pregunta por una pendiente o si ya está cancelada', async () => {
    const { item, renter, ownerToken, renterToken } = await setUp();
    const pending = await createReservation(item.id, renter.id, {
      status: 'pending',
    });
    const cancelled = await createReservation(item.id, renter.id, {
      status: 'cancelled',
      startInDays: 20,
    });

    const ownerOnPending = await preview(pending.id, ownerToken);
    const renterOnCancelled = await preview(cancelled.id, renterToken);

    expect(ownerOnPending.status).toBe(409);
    expect(ownerOnPending.body).toEqual({ error: NOT_CANCELLABLE_MESSAGE });
    expect(renterOnCancelled.status).toBe(409);
  });
});

describe('POST /api/reservas/:id/cancelar: quién puede cancelar qué', () => {
  const cases: Array<[ReservationStatus, 'renter' | 'owner', number, string]> =
    [
      ['pending', 'renter', 200, 'el arrendatario cancela una pendiente'],
      ['pending', 'owner', 409, 'el propietario no cancela una pendiente'],
      ['accepted', 'renter', 200, 'el arrendatario cancela una aceptada'],
      ['accepted', 'owner', 200, 'el propietario cancela una aceptada'],
      ['paid', 'renter', 200, 'el arrendatario cancela una pagada'],
      ['paid', 'owner', 200, 'el propietario cancela una pagada'],
      ['cancelled', 'renter', 409, 'una cancelada no se cancela'],
      ['cancelled', 'owner', 409, 'una cancelada no se cancela'],
      ['rejected', 'renter', 409, 'una rechazada no se cancela'],
      ['rejected', 'owner', 409, 'una rechazada no se cancela'],
      ['expired', 'renter', 409, 'una caducada no se cancela'],
      ['expired', 'owner', 409, 'una caducada no se cancela'],
      ['in_progress', 'renter', 409, 'una en curso no se cancela'],
      ['in_progress', 'owner', 409, 'una en curso no se cancela'],
      ['finished', 'renter', 409, 'una finalizada no se cancela'],
      ['finished', 'owner', 409, 'una finalizada no se cancela'],
    ];

  it.each(cases)('%s como %s: %i (%s)', async (status, role, expected) => {
    const { item, renter, ownerToken, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      status,
      payment: status === 'accepted' ? undefined : {},
    });

    const response = await cancel(
      reservation.id,
      role === 'renter' ? renterToken : ownerToken,
    );

    expect(response.status).toBe(expected);
    if (expected === 409) {
      expect(response.body).toEqual({ error: NOT_CANCELLABLE_MESSAGE });
      expect((await stored(reservation.id)).status).toBe(status);
      expect(vi.mocked(refund)).not.toHaveBeenCalled();
    } else {
      expect(response.body.status).toBe('cancelled');
    }
  });

  it('401 sin sesión, 403 si no es de la reserva y 404 si no existe', async () => {
    const { item, renter, strangerToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id);

    const anonymous = await request(app).post(
      `/api/reservas/${reservation.id}/cancelar`,
    );
    expect(anonymous.status).toBe(401);
    expect((await cancel(reservation.id, strangerToken)).status).toBe(403);
    expect(
      (await cancel('00000000-0000-4000-8000-000000000000', strangerToken))
        .status,
    ).toBe(404);
    expect((await stored(reservation.id)).status).toBe('paid');
    expect(vi.mocked(refund)).not.toHaveBeenCalled();
  });

  it('una pendiente vencida se caduca al consultar y ya no se puede cancelar', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      status: 'pending',
      expiresInMs: -HOUR_MS,
      payment: {},
    });

    const response = await cancel(reservation.id, renterToken);

    expect(response.status).toBe(409);
    expect(await stored(reservation.id)).toMatchObject({
      status: 'expired',
      payment: 'released',
      cancellation: null,
    });
  });
});

describe('POST /api/reservas/:id/cancelar: pagada', () => {
  it('cancela el arrendatario a 5 días: reembolsa lo pagado menos el 35 % y suelta la fianza', async () => {
    const { item, renter, owner, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: { delivery: 3 },
    });

    const response = await cancel(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: reservation.id,
      status: 'cancelled',
      totalPrice: '20.00',
      cancellation: {
        by: { id: renter.id, username: 'bruno' },
        penaltyPercent: 35,
        penaltyAmount: '7.00',
        refundAmount: '16.00',
      },
    });
    expect(typeof response.body.cancellation.at).toBe('string');
    expect(response.body.owner.id).toBe(owner.id);
    expect(vi.mocked(refund).mock.calls).toEqual([['alquiler_ref', 1600]]);
    expect(vi.mocked(release).mock.calls).toEqual([['fianza_ref']]);
    expect(await stored(reservation.id)).toMatchObject({
      status: 'cancelled',
      payment: 'refunded',
      deposit: 'released',
    });
  });

  it('con menos de 3 días el arrendatario pierde el alquiler entero, pero recupera la entrega', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      startInDays: 2,
      payment: { delivery: 3 },
    });

    const response = await cancel(reservation.id, renterToken);

    expect(response.body.cancellation).toMatchObject({
      penaltyPercent: 100,
      penaltyAmount: '20.00',
      refundAmount: '3.00',
    });
    expect(vi.mocked(refund).mock.calls).toEqual([['alquiler_ref', 300]]);
  });

  it('con menos de 3 días y sin entrega no hay nada que reembolsar y el pago sigue «pagado»', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      startInDays: 0,
      payment: { depositStatus: null },
    });

    const response = await cancel(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(response.body.cancellation).toMatchObject({
      penaltyPercent: 100,
      refundAmount: '0.00',
    });
    expect(vi.mocked(refund)).not.toHaveBeenCalled();
    expect(await stored(reservation.id)).toMatchObject({
      status: 'cancelled',
      payment: 'paid',
    });
  });

  it('con 8 días o más no hay penalización y se devuelve todo', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      startInDays: 8,
      payment: { delivery: 3 },
    });

    const response = await cancel(reservation.id, renterToken);

    expect(response.body.cancellation).toMatchObject({
      penaltyPercent: 0,
      penaltyAmount: '0.00',
      refundAmount: '23.00',
    });
    expect(vi.mocked(refund).mock.calls).toEqual([['alquiler_ref', 2300]]);
  });

  it.each([
    [2, 100],
    [3, 35],
    [7, 35],
    [8, 0],
  ])(
    'a %i días de margen la penalización es el %i %%',
    async (days, percent) => {
      const { item, renter, renterToken } = await setUp();
      const reservation = await createReservation(item.id, renter.id, {
        startInDays: days,
        payment: {},
      });

      const response = await cancel(reservation.id, renterToken);

      expect(response.body.cancellation.penaltyPercent).toBe(percent);
    },
  );

  it('cancela el propietario: se devuelve todo al arrendatario y la penalización solo se registra a su cargo', async () => {
    const { item, renter, owner, ownerToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: { delivery: 3 },
    });

    const response = await cancel(reservation.id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body.cancellation).toMatchObject({
      by: { id: owner.id, username: 'ana' },
      penaltyPercent: 35,
      penaltyAmount: '7.00',
      refundAmount: '23.00',
    });
    expect(vi.mocked(refund).mock.calls).toEqual([['alquiler_ref', 2300]]);
    const { cancellation } = await stored(reservation.id);
    expect(cancellation?.cancelledById).toBe(owner.id);
    expect(cancellation?.penaltyAmount.toFixed(2)).toBe('7.00');
  });

  it('la fianza retenida se libera, la cobrada se devuelve, la pendiente se marca liberada y sin fianza no se toca', async () => {
    const { item, renter, renterToken } = await setUp();
    const held = await createReservation(item.id, renter.id, {
      startInDays: 10,
      payment: {
        depositStatus: 'held',
        rentalReference: 'a1',
        depositReference: 'f1',
      },
    });
    const collected = await createReservation(item.id, renter.id, {
      startInDays: 20,
      payment: {
        depositStatus: 'collected',
        rentalReference: 'a2',
        depositReference: 'f2',
      },
    });
    const pending = await createReservation(item.id, renter.id, {
      startInDays: 30,
      payment: {
        depositStatus: 'pending',
        rentalReference: 'a3',
        depositReference: null,
      },
    });
    const none = await createReservation(item.id, renter.id, {
      startInDays: 40,
      payment: {
        depositStatus: null,
        rentalReference: 'a4',
        depositReference: null,
      },
    });

    for (const reservation of [held, collected, pending, none]) {
      expect((await cancel(reservation.id, renterToken)).status).toBe(200);
    }

    expect((await stored(held.id)).deposit).toBe('released');
    expect((await stored(collected.id)).deposit).toBe('returned');
    expect((await stored(pending.id)).deposit).toBe('released');
    expect((await stored(none.id)).deposit).toBeNull();
    expect(vi.mocked(release).mock.calls).toEqual([['f1']]);
    expect(vi.mocked(refund).mock.calls).toEqual([
      ['a1', 2000],
      ['f2', undefined],
      ['a2', 2000],
      ['a3', 2000],
      ['a4', 2000],
    ]);
  });

  it('un pago de demo (sin referencias) pasa a «reembolsado» sin llamar a la pasarela', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: { rentalReference: null, depositReference: null },
    });

    const response = await cancel(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(vi.mocked(refund)).not.toHaveBeenCalled();
    expect(vi.mocked(release)).not.toHaveBeenCalled();
    expect(await stored(reservation.id)).toMatchObject({
      payment: 'refunded',
      deposit: 'released',
    });
  });

  it('si falla el reembolso responde 502 y la reserva, el pago y la fianza quedan como estaban', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: { delivery: 3 },
    });
    vi.mocked(refund).mockRejectedValueOnce(new Error('Stripe caído'));

    const response = await cancel(reservation.id, renterToken);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: CANCEL_FAILED_MESSAGE });
    expect(await stored(reservation.id)).toEqual({
      status: 'paid',
      payment: 'paid',
      deposit: 'held',
      cancellation: null,
    });
  });

  it('si falla soltar la fianza responde 502 y no se reembolsa nada', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: {},
    });
    vi.mocked(release).mockRejectedValueOnce(new Error('Stripe caído'));

    const response = await cancel(reservation.id, ownerToken);

    expect(response.status).toBe(502);
    expect(vi.mocked(refund)).not.toHaveBeenCalled();
    expect(await stored(reservation.id)).toMatchObject({
      status: 'paid',
      payment: 'paid',
      cancellation: null,
    });
  });

  it('tras un 502 se puede reintentar', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: {},
    });
    vi.mocked(refund).mockRejectedValueOnce(new Error('Stripe caído'));

    expect((await cancel(reservation.id, renterToken)).status).toBe(502);
    const retry = await cancel(reservation.id, renterToken);

    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe('cancelled');
  });
});

describe('POST /api/reservas/:id/cancelar: pendiente y aceptada sin pago', () => {
  it('pendiente con bloqueo: lo libera y el pago pasa a «liberado»', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      status: 'pending',
      startInDays: 1,
      payment: {},
    });

    const response = await cancel(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'cancelled',
      expiresAt: null,
      cancellation: {
        by: { username: 'bruno' },
        penaltyPercent: 0,
        penaltyAmount: '0.00',
        refundAmount: '0.00',
      },
    });
    expect(vi.mocked(release).mock.calls).toEqual([['alquiler_ref']]);
    expect(vi.mocked(refund)).not.toHaveBeenCalled();
    expect(await stored(reservation.id)).toMatchObject({
      status: 'cancelled',
      payment: 'released',
    });
  });

  it('pendiente de demo (sin referencia): no llama a la pasarela', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      status: 'pending',
      payment: { rentalReference: null },
    });

    const response = await cancel(reservation.id, renterToken);

    expect(response.status).toBe(200);
    expect(vi.mocked(release)).not.toHaveBeenCalled();
    expect((await stored(reservation.id)).payment).toBe('released');
  });

  it('si falla liberar el bloqueo responde 502 y la solicitud sigue pendiente', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      status: 'pending',
      payment: {},
    });
    vi.mocked(release).mockRejectedValueOnce(new Error('Stripe caído'));

    const response = await cancel(reservation.id, renterToken);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: CANCEL_FAILED_MESSAGE });
    expect(await stored(reservation.id)).toEqual({
      status: 'pending',
      payment: 'authorized',
      deposit: 'held',
      cancellation: null,
    });
  });

  it('aceptada del flujo anterior: gratis, sin tocar la pasarela, y la cancela cualquiera de las dos partes', async () => {
    const { item, renter, ownerToken, renterToken } = await setUp();
    const byRenter = await createReservation(item.id, renter.id, {
      status: 'accepted',
      startInDays: 1,
    });
    const byOwner = await createReservation(item.id, renter.id, {
      status: 'accepted',
      startInDays: 20,
    });

    const first = await cancel(byRenter.id, renterToken);
    const second = await cancel(byOwner.id, ownerToken);

    expect(first.status).toBe(200);
    expect(first.body.cancellation).toMatchObject({
      by: { username: 'bruno' },
      penaltyPercent: 0,
      penaltyAmount: '0.00',
      refundAmount: '0.00',
    });
    expect(second.body.cancellation.by.username).toBe('ana');
    expect(vi.mocked(release)).not.toHaveBeenCalled();
    expect(vi.mocked(refund)).not.toHaveBeenCalled();
  });
});

describe('POST /api/reservas/:id/cancelar: concurrencia y fechas', () => {
  it('si las dos partes cancelan a la vez, una recibe 200 y la otra 409, y se reembolsa una sola vez', async () => {
    const { item, renter, ownerToken, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: { delivery: 3 },
    });

    const responses = await Promise.all([
      cancel(reservation.id, renterToken),
      cancel(reservation.id, ownerToken),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(vi.mocked(refund)).toHaveBeenCalledTimes(1);
    expect(await prisma.cancellation.count()).toBe(1);
  });

  it('dos cancelaciones seguidas de la misma persona: la segunda da 409', async () => {
    const { item, renter, renterToken } = await setUp();
    const reservation = await createReservation(item.id, renter.id, {
      payment: {},
    });

    expect((await cancel(reservation.id, renterToken)).status).toBe(200);
    const second = await cancel(reservation.id, renterToken);

    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: NOT_CANCELLABLE_MESSAGE });
    expect(vi.mocked(refund)).toHaveBeenCalledTimes(1);
  });

  it('una reserva cancelada deja libres sus fechas: otra solicitud solapada ya se puede aceptar', async () => {
    const { item, renter, ownerToken, renterToken } = await setUp();
    const other = await createTestUser({
      username: 'dani',
      email: 'dani@rentit.test',
    });
    const booked = await createReservation(item.id, renter.id, {
      startInDays: 10,
      endInDays: 12,
      payment: {},
    });
    const competitor = await createReservation(item.id, other.id, {
      status: 'pending',
      startInDays: 11,
      endInDays: 13,
    });

    const blocked = await request(app)
      .post(`/api/reservas/${competitor.id}/aceptar`)
      .set('Authorization', `Bearer ${ownerToken}`);
    await cancel(booked.id, renterToken);
    const accepted = await request(app)
      .post(`/api/reservas/${competitor.id}/aceptar`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(blocked.status).toBe(409);
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('accepted');
  });
});

describe('«Mis solicitudes» con cancelaciones', () => {
  it('las dos partes ven quién canceló, cuándo, la penalización y lo devuelto; las demás llevan null', async () => {
    const { item, renter, ownerToken, renterToken } = await setUp();
    const cancelled = await createReservation(item.id, renter.id, {
      startInDays: 5,
      payment: { delivery: 3 },
    });
    const active = await createReservation(item.id, renter.id, {
      startInDays: 30,
      payment: { rentalReference: 'otra_a', depositReference: 'otra_f' },
    });
    await cancel(cancelled.id, renterToken);

    for (const [token, key] of [
      [renterToken, 'sent'],
      [ownerToken, 'received'],
    ] as const) {
      const response = await request(app)
        .get('/api/usuarios/me/reservas')
        .set('Authorization', `Bearer ${token}`);
      const list = response.body[key] as Array<{
        id: string;
        cancellation: unknown;
      }>;

      expect(response.status).toBe(200);
      expect(list.find(({ id }) => id === cancelled.id)?.cancellation).toEqual({
        by: { id: renter.id, username: 'bruno' },
        at: expect.any(String),
        penaltyPercent: 35,
        penaltyAmount: '7.00',
        refundAmount: '16.00',
      });
      expect(list.find(({ id }) => id === active.id)?.cancellation).toBeNull();
    }
  });
});
