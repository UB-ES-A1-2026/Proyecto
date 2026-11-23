// Con Stripe activo, el paymentIntentId que manda el cliente debe ser un PaymentIntent (pi_…):
// nadie puede reservar sin pagar enviando «simulado_…» (US-07.01, T10 #285).
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/config/env.js')>();
  return { ...actual, env: { ...actual.env, stripeSecretKey: 'sk_test_fake' } };
});

const { app } = await import('../../src/app.js');
const { prisma } = await import('../../src/repositories/prisma.js');
const { todayInSpain } =
  await import('../../src/services/reservationService.js');
const { resetDb } = await import('../helpers/db.js');
const { createTestItem } = await import('../helpers/items.js');
const { createTestUser, TEST_PASSWORD } = await import('../helpers/users.js');

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/reservas con Stripe activo', () => {
  it.each(['simulado_x', 'simulado_3ds_abc', 'cualquier_cosa'])(
    'rechaza con 400 el paymentIntentId «%s» y no crea la reserva',
    async (paymentIntentId) => {
      const owner = await createTestUser();
      await createTestUser({ username: 'bruno', email: 'bruno@rentit.test' });
      const item = await createTestItem(owner.id, { homeDelivery: true });
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bruno@rentit.test', password: TEST_PASSWORD });
      const start = new Date(`${todayInSpain()}T00:00:00.000Z`);
      start.setUTCDate(start.getUTCDate() + 10);
      const day = start.toISOString().slice(0, 10);

      const response = await request(app)
        .post('/api/reservas')
        .set('Authorization', `Bearer ${login.body.token as string}`)
        .send({
          itemId: item.id,
          startDate: day,
          endDate: day,
          deliveryMode: 'home',
          paymentIntentId,
        });

      expect(response.status).toBe(400);
      expect(response.body.field).toBe('paymentIntentId');
      expect(await prisma.reservation.count()).toBe(0);
    },
  );
});

describe('referencias simuladas guardadas en la BD con Stripe activo', () => {
  it('capture, release y refund no llaman a Stripe (no-op)', async () => {
    const { capture, release, refund, authorizeDeposit } =
      await import('../../src/services/paymentGateway.js');

    await expect(capture('simulado_abc')).resolves.toBeUndefined();
    await expect(release('simulado_abc')).resolves.toBeUndefined();
    await expect(refund('simulado_abc', 100)).resolves.toBeUndefined();
    await expect(
      authorizeDeposit('simulado_abc', 100, { capture: false }),
    ).resolves.toEqual({ reference: expect.stringMatching(/^simulado_/) });
  });
});
