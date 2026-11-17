import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { capture, release } from '../../src/services/paymentGateway.js';
import { EXPIRED_MESSAGE } from '../../src/services/reservationExpiry.js';
import {
  CAPTURE_FAILED_MESSAGE,
  RELEASE_FAILED_MESSAGE,
} from '../../src/services/reservationDecisionService.js';
import { todayInSpain } from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Cobrar al aceptar, liberar al rechazar y caducar al consultar (US-07.01, #72 y #343).
// La pasarela simulada de verdad, pero espiada.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026
vi.mock('../../src/services/paymentGateway.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/paymentGateway.js')
    >();
  return {
    ...actual,
    capture: vi.fn(actual.capture),
    release: vi.fn(actual.release),
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
  vi.mocked(capture).mockClear();
  vi.mocked(release).mockClear();
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
  const item = await createTestItem(owner.id);
  return {
    owner,
    renter,
    item,
    ownerToken: await loginAs('ana@rentit.test'),
    renterToken: await loginAs('bruno@rentit.test'),
  };
}

// Solicitud pendiente. `reference`: undefined = sin fila de pago (flujo antiguo), null = pago de
// demo sin pasarela, texto = pago con bloqueo.
async function pending(
  itemId: string,
  renterId: string,
  options: {
    reference?: string | null;
    startInDays?: number;
    endInDays?: number;
    expiresInMs?: number | null;
  } = {},
) {
  const reservation = await prisma.reservation.create({
    data: {
      itemId,
      renterId,
      startDate: new Date(daysFromToday(options.startInDays ?? 5)),
      endDate: new Date(daysFromToday(options.endInDays ?? 7)),
      totalPrice: 15,
      status: 'pending',
      expiresAt:
        options.expiresInMs === null
          ? null
          : new Date(Date.now() + (options.expiresInMs ?? 40 * HOUR_MS)),
    },
  });
  if (options.reference !== undefined) {
    await prisma.payment.create({
      data: {
        reservationId: reservation.id,
        rentalAmount: 15,
        depositAmount: 30,
        depositStatus: 'pending',
        rentalReference: options.reference,
      },
    });
  }
  return reservation;
}

function decide(action: string, id: string, token: string) {
  return request(app)
    .post(`/api/reservas/${id}/${action}`)
    .set('Authorization', `Bearer ${token}`);
}

async function state(id: string) {
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id },
    include: { payment: true },
  });
  return { status: reservation.status, payment: reservation.payment?.status };
}

describe('POST /api/reservas/:id/aceptar con pago', () => {
  it('cobra la referencia y deja la reserva y el pago en «pagada»', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, {
      reference: 'simulado_a',
    });

    const response = await decide('aceptar', reservation.id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('paid');
    expect(response.body.expiresAt).toBeNull();
    expect(vi.mocked(capture).mock.calls).toEqual([['simulado_a']]);
    expect(await state(reservation.id)).toEqual({
      status: 'paid',
      payment: 'paid',
    });
  });

  it('con un pago de demo (sin referencia) paga sin llamar a la pasarela', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, { reference: null });

    const response = await decide('aceptar', reservation.id, ownerToken);

    expect(response.status).toBe(200);
    expect(vi.mocked(capture)).not.toHaveBeenCalled();
    expect(await state(reservation.id)).toEqual({
      status: 'paid',
      payment: 'paid',
    });
  });

  it('una solicitud antigua sin pago pasa a «aceptada»', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, {
      expiresInMs: null,
    });

    const response = await decide('aceptar', reservation.id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('accepted');
    expect(vi.mocked(capture)).not.toHaveBeenCalled();
    expect(await state(reservation.id)).toEqual({
      status: 'accepted',
      payment: undefined,
    });
  });

  it('si el cobro falla responde 502 y todo queda como estaba', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, {
      reference: 'simulado_a',
    });
    const other = await createTestUser({
      username: 'carla',
      email: 'carla@rentit.test',
    });
    const competitor = await pending(item.id, other.id, {
      reference: 'simulado_b',
    });
    vi.mocked(capture).mockRejectedValueOnce(new Error('Stripe caído'));

    const response = await decide('aceptar', reservation.id, ownerToken);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: CAPTURE_FAILED_MESSAGE });
    expect(await state(reservation.id)).toEqual({
      status: 'pending',
      payment: 'authorized',
    });
    expect(await state(competitor.id)).toEqual({
      status: 'pending',
      payment: 'authorized',
    });
    expect(vi.mocked(release)).not.toHaveBeenCalled();
  });

  it('rechaza las otras pendientes con fechas solapadas, libera su pago y suelta su bloqueo', async () => {
    const { item, renter, ownerToken } = await setUp();
    const carla = await createTestUser({
      username: 'carla',
      email: 'carla@rentit.test',
    });
    const dani = await createTestUser({
      username: 'dani',
      email: 'dani@rentit.test',
    });
    const accepted = await pending(item.id, renter.id, {
      reference: 'simulado_a',
      startInDays: 5,
      endInDays: 7,
    });
    const overlapping = await pending(item.id, carla.id, {
      reference: 'simulado_b',
      startInDays: 7,
      endInDays: 9,
    });
    const demo = await pending(item.id, dani.id, {
      reference: null,
      startInDays: 6,
      endInDays: 6,
    });
    const apart = await pending(item.id, carla.id, {
      reference: 'simulado_c',
      startInDays: 20,
      endInDays: 21,
    });

    const response = await decide('aceptar', accepted.id, ownerToken);

    expect(response.status).toBe(200);
    expect(await state(overlapping.id)).toEqual({
      status: 'rejected',
      payment: 'released',
    });
    expect(await state(demo.id)).toEqual({
      status: 'rejected',
      payment: 'released',
    });
    expect(await state(apart.id)).toEqual({
      status: 'pending',
      payment: 'authorized',
    });
    expect(vi.mocked(release).mock.calls).toEqual([['simulado_b']]);
  });

  it('si soltar un bloqueo falla, la aceptación sigue adelante', async () => {
    const { item, renter, ownerToken } = await setUp();
    const carla = await createTestUser({
      username: 'carla',
      email: 'carla@rentit.test',
    });
    const accepted = await pending(item.id, renter.id, {
      reference: 'simulado_a',
    });
    const overlapping = await pending(item.id, carla.id, {
      reference: 'simulado_b',
    });
    vi.mocked(release).mockRejectedValueOnce(new Error('Stripe caído'));

    const response = await decide('aceptar', accepted.id, ownerToken);

    expect(response.status).toBe(200);
    expect((await state(overlapping.id)).status).toBe('rejected');
  });
});

describe('POST /api/reservas/:id/aceptar vencida', () => {
  it('con las 48 h pasadas responde 409, la caduca, libera el pago y suelta el bloqueo', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, {
      reference: 'simulado_a',
      expiresInMs: -1000,
    });

    const response = await decide('aceptar', reservation.id, ownerToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: EXPIRED_MESSAGE });
    expect(vi.mocked(capture)).not.toHaveBeenCalled();
    expect(vi.mocked(release).mock.calls).toEqual([['simulado_a']]);
    expect(await state(reservation.id)).toEqual({
      status: 'expired',
      payment: 'released',
    });
  });

  it('con la fecha de inicio ya pasada responde 409 y la caduca', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, {
      reference: 'simulado_a',
      startInDays: -1,
      endInDays: 2,
    });

    const response = await decide('aceptar', reservation.id, ownerToken);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(EXPIRED_MESSAGE);
    expect(vi.mocked(release).mock.calls).toEqual([['simulado_a']]);
    expect(await state(reservation.id)).toEqual({
      status: 'expired',
      payment: 'released',
    });
  });

  it('una solicitud que empieza hoy todavía se puede aceptar', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, {
      reference: 'simulado_a',
      startInDays: 0,
      endInDays: 1,
    });

    const response = await decide('aceptar', reservation.id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('paid');
  });

  it('aceptar una solicitud ya caducada devuelve 409 «no pendiente» sin tocar nada más', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, {
      reference: 'simulado_a',
      expiresInMs: -1000,
    });
    await decide('aceptar', reservation.id, ownerToken);
    vi.mocked(release).mockClear();

    const again = await decide('aceptar', reservation.id, ownerToken);

    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Esta solicitud ya no está pendiente.');
    expect(vi.mocked(release)).not.toHaveBeenCalled();
    expect(vi.mocked(capture)).not.toHaveBeenCalled();
  });
});

describe('POST /api/reservas/:id/rechazar con pago', () => {
  it('rechaza, libera el pago y suelta el bloqueo', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, {
      reference: 'simulado_a',
    });

    const response = await decide('rechazar', reservation.id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('rejected');
    expect(vi.mocked(release).mock.calls).toEqual([['simulado_a']]);
    expect(await state(reservation.id)).toEqual({
      status: 'rejected',
      payment: 'released',
    });
  });

  it('con un pago de demo libera el pago sin llamar a la pasarela', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, { reference: null });

    const response = await decide('rechazar', reservation.id, ownerToken);

    expect(response.status).toBe(200);
    expect(vi.mocked(release)).not.toHaveBeenCalled();
    expect(await state(reservation.id)).toEqual({
      status: 'rejected',
      payment: 'released',
    });
  });

  it('si soltar el bloqueo falla responde 502 y la solicitud sigue pendiente', async () => {
    const { item, renter, ownerToken } = await setUp();
    const reservation = await pending(item.id, renter.id, {
      reference: 'simulado_a',
    });
    vi.mocked(release).mockRejectedValueOnce(new Error('Stripe caído'));

    const response = await decide('rechazar', reservation.id, ownerToken);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: RELEASE_FAILED_MESSAGE });
    expect(await state(reservation.id)).toEqual({
      status: 'pending',
      payment: 'authorized',
    });
  });
});

describe('caducar al consultar GET /api/usuarios/me/reservas', () => {
  it('caduca las vencidas del arrendatario y del propietario, y deja las vigentes', async () => {
    const { item, renter, ownerToken, renterToken } = await setUp();
    const carla = await createTestUser({
      username: 'carla',
      email: 'carla@rentit.test',
    });
    const byTime = await pending(item.id, renter.id, {
      reference: 'simulado_a',
      expiresInMs: -1000,
    });
    const byDate = await pending(item.id, carla.id, {
      reference: 'simulado_b',
      startInDays: -2,
      endInDays: -1,
    });
    const valid = await pending(item.id, carla.id, {
      reference: 'simulado_c',
      startInDays: 12,
      endInDays: 13,
    });

    const received = await request(app)
      .get('/api/usuarios/me/reservas')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(received.status).toBe(200);
    const statuses = Object.fromEntries(
      (received.body.received as { id: string; status: string }[]).map((r) => [
        r.id,
        r.status,
      ]),
    );
    expect(statuses).toEqual({
      [byTime.id]: 'expired',
      [byDate.id]: 'expired',
      [valid.id]: 'pending',
    });
    expect((await state(byTime.id)).payment).toBe('released');
    expect((await state(byDate.id)).payment).toBe('released');
    expect((await state(valid.id)).payment).toBe('authorized');
    expect(
      vi
        .mocked(release)
        .mock.calls.map(([ref]) => ref)
        .sort(),
    ).toEqual(['simulado_a', 'simulado_b']);

    // Ya caducadas: pedirlas otra vez no vuelve a soltar nada.
    vi.mocked(release).mockClear();
    const sent = await request(app)
      .get('/api/usuarios/me/reservas')
      .set('Authorization', `Bearer ${renterToken}`);
    expect(sent.body.sent[0].status).toBe('expired');
    expect(sent.body.sent[0].expiresAt).toBeNull();
    expect(vi.mocked(release)).not.toHaveBeenCalled();
  });

  it('solo toca las solicitudes del usuario que consulta', async () => {
    const { item, renter } = await setUp();
    const outsider = await createTestUser({
      username: 'eva',
      email: 'eva@rentit.test',
    });
    const reservation = await pending(item.id, renter.id, {
      reference: 'simulado_a',
      expiresInMs: -1000,
    });
    const token = await loginAs('eva@rentit.test');
    void outsider;

    await request(app)
      .get('/api/usuarios/me/reservas')
      .set('Authorization', `Bearer ${token}`);

    expect(await state(reservation.id)).toEqual({
      status: 'pending',
      payment: 'authorized',
    });
    expect(vi.mocked(release)).not.toHaveBeenCalled();
  });

  it('si soltar el bloqueo falla, la lista se devuelve igual', async () => {
    const { item, renter, renterToken } = await setUp();
    await pending(item.id, renter.id, {
      reference: 'simulado_a',
      expiresInMs: -1000,
    });
    vi.mocked(release).mockRejectedValueOnce(new Error('Stripe caído'));

    const response = await request(app)
      .get('/api/usuarios/me/reservas')
      .set('Authorization', `Bearer ${renterToken}`);

    expect(response.status).toBe(200);
    expect(response.body.sent[0].status).toBe('expired');
  });
});
