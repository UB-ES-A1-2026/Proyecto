// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem, getTestCategory } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

const NOT_FOUND = { error: 'No hemos encontrado este objeto.' };

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

function getDetail(id: string, token?: string) {
  const call = request(app).get(`/api/objetos/${id}`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

async function createOwners() {
  const ana = await createTestUser();
  const bruno = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  return { ana, bruno };
}

describe('GET /api/objetos/:id (US-03.03, #119)', () => {
  it('returns the public detail of a published item without a session (criterios 2 y 3)', async () => {
    const { ana } = await createOwners();
    const category = await getTestCategory();
    const item = await createTestItem(ana.id, {
      title: 'Taladro percutor',
      dailyPrice: 5,
      deposit: 30,
      neighborhood: 'Gràcia',
    });

    const response = await getDetail(item.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: item.id,
      title: 'Taladro percutor',
      description: item.description,
      dailyPrice: '5.00',
      deposit: '30.00',
      neighborhood: 'Gràcia',
      status: 'published',
      category: { id: category.id, name: category.name },
      photos: [],
      homeDelivery: false,
      riderDelivery: false,
      pickupPointDelivery: false,
      owner: { id: ana.id, username: 'ana' },
      createdAt: item.createdAt.toISOString(),
    });
  });

  it('never exposes the owner email or private fields (CP-VER-03)', async () => {
    const { ana } = await createOwners();
    const item = await createTestItem(ana.id);

    const response = await getDetail(item.id);

    expect(JSON.stringify(response.body)).not.toContain('ana@rentit.test');
    expect(response.body.owner).toEqual({ id: ana.id, username: 'ana' });
    expect(response.body).not.toHaveProperty('ownerId');
    expect(response.body).not.toHaveProperty('latitude');
  });

  // US-05.01 (#281): la dirección exacta del propietario nunca es pública.
  it('never includes the address for anyone but the owner', async () => {
    const { ana } = await createOwners();
    const item = await createTestItem(ana.id, {
      address: 'Carrer de Verdi, 45, 2º 1ª',
      homeDelivery: true,
    });
    const brunoToken = await loginAs('bruno@rentit.test');

    for (const token of [undefined, brunoToken, 'token-falso']) {
      const response = await getDetail(item.id, token);
      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('address');
      expect(JSON.stringify(response.body)).not.toContain('Verdi');
    }
  });

  it('includes the address when the owner asks for the item', async () => {
    const { ana } = await createOwners();
    const item = await createTestItem(ana.id, {
      address: 'Carrer de Verdi, 45, 2º 1ª',
      homeDelivery: true,
    });
    const token = await loginAs('ana@rentit.test');

    const response = await getDetail(item.id, token);

    expect(response.body.address).toBe('Carrer de Verdi, 45, 2º 1ª');
  });

  it.each(['paused', 'withdrawn'] as const)(
    'returns a %s item to its owner',
    async (status) => {
      const { ana } = await createOwners();
      const item = await createTestItem(ana.id, { status });
      const token = await loginAs('ana@rentit.test');

      const response = await getDetail(item.id, token);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(status);
    },
  );

  it.each(['paused', 'withdrawn'] as const)(
    'returns 404 for a %s item to anyone else',
    async (status) => {
      const { ana } = await createOwners();
      const item = await createTestItem(ana.id, { status });
      const brunoToken = await loginAs('bruno@rentit.test');

      for (const token of [undefined, brunoToken, 'token-falso']) {
        const response = await getDetail(item.id, token);
        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_FOUND);
      }
    },
  );

  it('returns 404 for an item that does not exist', async () => {
    const response = await getDetail('00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND);
  });

  it('returns 404 for an id that is not a UUID', async () => {
    const response = await getDetail('no-es-un-uuid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND);
  });

  it('treats an invalid token as no session instead of returning 401', async () => {
    const { ana } = await createOwners();
    const item = await createTestItem(ana.id);

    const response = await getDetail(item.id, 'token-falso');

    expect(response.status).toBe(200);
  });
});
