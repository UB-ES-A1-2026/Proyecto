// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { getTestCategory } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

beforeEach(async () => {
  await resetDb();
});

async function loginAs(email = 'ana@rentit.test'): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

async function validBody() {
  const category = await getTestCategory('Deporte');
  return {
    title: '  Tienda de campaña para 4  ',
    description: 'Tienda iglú, fácil de montar.',
    categoryId: category.id,
    dailyPrice: 7.5,
    deposit: '40',
    neighborhood: 'Sants',
    address: '  Carrer de Sants, 12, 3º 2ª  ',
    homeDelivery: true,
    pickupPointDelivery: true,
  };
}

function publish(token: string | undefined, body: unknown) {
  const call = request(app).post('/api/objetos');
  return (token ? call.set('Authorization', `Bearer ${token}`) : call).send(
    body as object,
  );
}

describe('POST /api/objetos (US-02.01, #14)', () => {
  it('creates the item for the logged-in owner and returns its public detail', async () => {
    const ana = await createTestUser();
    const token = await loginAs();
    const body = await validBody();

    const response = await publish(token, body);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      title: 'Tienda de campaña para 4',
      description: 'Tienda iglú, fácil de montar.',
      dailyPrice: '7.50',
      deposit: '40.00',
      neighborhood: 'Sants',
      address: 'Carrer de Sants, 12, 3º 2ª',
      status: 'published',
      category: { id: body.categoryId, name: 'Deporte' },
      photos: [],
      homeDelivery: true,
      riderDelivery: false,
      pickupPointDelivery: true,
      owner: { id: ana.id, username: 'ana' },
      createdAt: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain('ana@rentit.test');

    const stored = await prisma.item.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(stored.ownerId).toBe(ana.id);
    expect(stored.dailyPrice.toFixed(2)).toBe('7.50');
  });

  it('ignores an ownerId sent in the body (criterio 4)', async () => {
    const ana = await createTestUser();
    const bruno = await createTestUser({
      username: 'bruno',
      email: 'bruno@rentit.test',
    });
    const token = await loginAs();

    const response = await publish(token, {
      ...(await validBody()),
      ownerId: bruno.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.owner.id).toBe(ana.id);
  });

  it('defaults to 0 deposit and published status', async () => {
    await createTestUser();
    const token = await loginAs();
    const { title, description, categoryId, neighborhood } = await validBody();

    const response = await publish(token, {
      title,
      description,
      categoryId,
      neighborhood,
      dailyPrice: '5',
      pickupPointDelivery: true,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      deposit: '0.00',
      homeDelivery: false,
      riderDelivery: false,
      pickupPointDelivery: true,
      address: null,
      status: 'published',
    });
  });

  it('can be published as paused («disponibilidad»)', async () => {
    await createTestUser();
    const token = await loginAs();

    const response = await publish(token, {
      ...(await validBody()),
      status: 'paused',
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('paused');
  });

  it.each([
    ['title', '', 'nombre'],
    ['title', 'x'.repeat(101), 'nombre'],
    ['description', '   ', 'descripción'],
    ['categoryId', 'no-es-un-uuid', 'categoría'],
    ['categoryId', '00000000-0000-4000-8000-000000000000', 'categoría'],
    ['dailyPrice', 0, 'precio'],
    ['dailyPrice', -5, 'precio'],
    ['dailyPrice', '7.555', 'precio'],
    ['dailyPrice', 'diez', 'precio'],
    ['dailyPrice', 123456789, 'precio'],
    ['deposit', -1, 'fianza'],
    ['neighborhood', '', 'barrio'],
    ['neighborhood', 'Vila de Gràcia', 'barrio'],
    ['neighborhood', 'Madrid', 'barrio'],
    ['address', '   ', 'dirección'],
    ['address', 'x'.repeat(201), 'dirección'],
    ['address', 42, 'dirección'],
    ['homeDelivery', 'sí', 'entrega a domicilio'],
    ['status', 'withdrawn', 'disponibilidad'],
  ])('returns 400 when %s is %j (criterio 5)', async (field, value, label) => {
    await createTestUser();
    const token = await loginAs();

    const response = await publish(token, {
      ...(await validBody()),
      [field]: value,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: `El campo "${label}" no es correcto, revísalo.`,
      field,
    });
    expect(await prisma.item.count()).toBe(0);
  });

  it('stores the address in the item', async () => {
    await createTestUser();
    const token = await loginAs();

    const response = await publish(token, await validBody());

    expect(response.status).toBe(201);
    const stored = await prisma.item.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(stored.address).toBe('Carrer de Sants, 12, 3º 2ª');
  });

  it('does not need an address when only the pickup point is offered', async () => {
    await createTestUser();
    const token = await loginAs();

    const response = await publish(token, {
      ...(await validBody()),
      address: undefined,
      homeDelivery: false,
      pickupPointDelivery: true,
    });

    expect(response.status).toBe(201);
    expect(response.body.address).toBeNull();
  });

  it.each(['homeDelivery', 'riderDelivery'])(
    'returns 400 for the address when %s is on and there is no address',
    async (flag) => {
      await createTestUser();
      const token = await loginAs();

      const response = await publish(token, {
        ...(await validBody()),
        address: undefined,
        homeDelivery: false,
        pickupPointDelivery: false,
        [flag]: true,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'El campo "dirección" no es correcto, revísalo.',
        field: 'address',
      });
      expect(await prisma.item.count()).toBe(0);
    },
  );

  it('returns 400 when no delivery mode is chosen', async () => {
    await createTestUser();
    const token = await loginAs();

    const response = await publish(token, {
      ...(await validBody()),
      homeDelivery: false,
      riderDelivery: false,
      pickupPointDelivery: false,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Elige al menos un modo de entrega.',
      field: 'deliveryModes',
    });
    expect(await prisma.item.count()).toBe(0);
  });

  it('returns 400 for a missing required field', async () => {
    await createTestUser();
    const token = await loginAs();
    const body: Record<string, unknown> = await validBody();
    delete body.dailyPrice;

    const response = await publish(token, body);

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('dailyPrice');
  });

  it('returns 401 without a session', async () => {
    const response = await publish(undefined, await validBody());

    expect(response.status).toBe(401);
    expect(await prisma.item.count()).toBe(0);
  });
});
