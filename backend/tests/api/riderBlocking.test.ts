// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { todayInSpain } from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem, getTestCategory } from '../helpers/items.js';
import {
  createTestRider,
  createTestUser,
  TEST_PASSWORD,
} from '../helpers/users.js';

// US-10.03: una cuenta de rider (con cualquier estado de solicitud) no publica ni solicita.
const BLOCKED = {
  error: 'Las cuentas de rider no pueden solicitar ni publicar objetos.',
};

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

async function publishBody() {
  const category = await getTestCategory('Deporte');
  return {
    title: 'Tienda de campaña para 4',
    description: 'Tienda iglú, fácil de montar.',
    categoryId: category.id,
    dailyPrice: 7.5,
    deposit: '40',
    neighborhood: 'Sants',
  };
}

function tomorrow(): string {
  const date = new Date(`${todayInSpain()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

describe.each(['pending', 'approved', 'rejected'] as const)(
  'a rider account with a %s application',
  (status) => {
    it('cannot publish an item', async () => {
      await createTestRider(status);
      const token = await loginAs('rider@rentit.test');

      const response = await request(app)
        .post('/api/objetos')
        .set('Authorization', `Bearer ${token}`)
        .send(await publishBody());

      expect(response.status).toBe(403);
      expect(response.body).toEqual(BLOCKED);
      expect(await prisma.item.count()).toBe(0);
    });

    it('cannot request a reservation', async () => {
      const owner = await createTestUser();
      const item = await createTestItem(owner.id);
      await createTestRider(status);
      const token = await loginAs('rider@rentit.test');

      const response = await request(app)
        .post('/api/reservas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          itemId: item.id,
          startDate: tomorrow(),
          endDate: tomorrow(),
        });

      expect(response.status).toBe(403);
      expect(response.body).toEqual(BLOCKED);
      expect(await prisma.reservation.count()).toBe(0);
    });
  },
);

describe('a regular account', () => {
  it('can still publish and request', async () => {
    await createTestUser();
    const owner = await createTestUser({
      username: 'bruno',
      email: 'bruno@rentit.test',
    });
    const item = await createTestItem(owner.id);
    const token = await loginAs('ana@rentit.test');

    const published = await request(app)
      .post('/api/objetos')
      .set('Authorization', `Bearer ${token}`)
      .send(await publishBody());
    const reserved = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemId: item.id, startDate: tomorrow(), endDate: tomorrow() });

    expect(published.status).toBe(201);
    expect(reserved.status).toBe(201);
  });
});
