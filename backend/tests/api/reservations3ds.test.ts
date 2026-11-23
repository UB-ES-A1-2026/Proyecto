// POST /api/reservas con 3D Secure en dos pasos (US-07.01, T10 #285), con la pasarela simulada.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { todayInSpain } from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

function daysFromToday(days: number): string {
  const date = new Date(`${todayInSpain()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function setUp(dailyPrice = 5) {
  const owner = await createTestUser();
  await createTestUser({ username: 'bruno', email: 'bruno@rentit.test' });
  const item = await createTestItem(owner.id, {
    dailyPrice,
    homeDelivery: true,
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'bruno@rentit.test', password: TEST_PASSWORD });
  return { item, token: login.body.token as string };
}

function post(token: string, body: object) {
  return (
    request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${token}`)
      // Entrega de US-05.01: por defecto, recogida en casa del propietario.
      .send({ deliveryMode: 'home', ...body })
  );
}

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/reservas con 3D Secure', () => {
  async function firstStep(token: string, itemId: string, days = [10, 12]) {
    const body = {
      itemId,
      startDate: daysFromToday(days[0]!),
      endDate: daysFromToday(days[1]!),
    };
    const response = await post(token, {
      ...body,
      confirmationTokenId: 'ctoken_3ds',
    });
    return { body, response };
  }

  it('responde 402 con requiresAction y no crea la reserva', async () => {
    const { item, token } = await setUp();

    const { response } = await firstStep(token, item.id);

    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({
      error: 'Tu banco pide verificar el pago.',
      field: 'confirmationTokenId',
      requiresAction: true,
    });
    expect(response.body.clientSecret).toEqual(expect.any(String));
    expect(response.body.paymentIntentId).toEqual(expect.any(String));
    expect(await prisma.reservation.count()).toBe(0);
  });

  it('con el paymentIntentId crea la reserva con esa referencia', async () => {
    const { item, token } = await setUp();
    const { body, response } = await firstStep(token, item.id);

    const second = await post(token, {
      ...body,
      paymentIntentId: response.body.paymentIntentId,
    });

    expect(second.status).toBe(201);
    expect(second.body.status).toBe('pending');
    const payment = await prisma.payment.findFirstOrThrow();
    expect(payment.rentalReference).toBe(response.body.paymentIntentId);
    expect(payment.rentalAmount.toFixed(2)).toBe('15.00');
  });

  it('no deja reutilizar el mismo paymentIntentId en otra reserva', async () => {
    const { item, token } = await setUp();
    const { body, response } = await firstStep(token, item.id);
    await post(token, {
      ...body,
      paymentIntentId: response.body.paymentIntentId,
    });

    const again = await post(token, {
      itemId: item.id,
      startDate: daysFromToday(20),
      endDate: daysFromToday(22),
      paymentIntentId: response.body.paymentIntentId,
    });

    expect(again.status).toBe(409);
    expect(await prisma.reservation.count()).toBe(1);
  });

  it('rechaza con 409 si las fechas no coinciden con las del primer paso', async () => {
    const { item, token } = await setUp();
    const { response } = await firstStep(token, item.id);

    const second = await post(token, {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(15),
      paymentIntentId: response.body.paymentIntentId,
    });

    expect(second.status).toBe(409);
    expect(second.body.field).toBe('paymentIntentId');
    expect(await prisma.reservation.count()).toBe(0);
  });

  it('rechaza con 409 el paymentIntentId de otro usuario', async () => {
    const { item, token } = await setUp();
    const { body, response } = await firstStep(token, item.id);
    await createTestUser({ username: 'carla', email: 'carla@rentit.test' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'carla@rentit.test', password: TEST_PASSWORD });

    const stolen = await post(login.body.token as string, {
      ...body,
      paymentIntentId: response.body.paymentIntentId,
    });

    expect(stolen.status).toBe(409);
    expect(await prisma.reservation.count()).toBe(0);
  });

  it('rechaza con 400 un paymentIntentId con forma inválida o inventado', async () => {
    const { item, token } = await setUp();
    const body = {
      itemId: item.id,
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
    };

    expect(
      (await post(token, { ...body, paymentIntentId: 'pi_123456789' })).status,
    ).toBe(400);
    const forged = `simulado_3ds_${Buffer.from('{"amountCents":1,"metadata":{}}').toString('base64url')}`;
    expect(
      (await post(token, { ...body, paymentIntentId: forged })).status,
    ).toBe(409);
    expect(await prisma.reservation.count()).toBe(0);
  });
});
