import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// GET /api/usuarios/me/objetos y PATCH /api/objetos/:id (US-02.02, #108): contrato publicado
// en la issue, el que usa la pantalla «Mis objetos» de #109.
// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026

const VALID_CHANGES = {
  title: 'Taladro nuevo',
  description: 'Con maletín y brocas nuevas.',
  dailyPrice: 7.5,
  deposit: 40,
};

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// Ana es la propietaria del objeto y Bruno, otro usuario.
async function setUp() {
  const ana = await createTestUser();
  const bruno = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(ana.id);
  const token = await loginAs('ana@rentit.test');

  return { ana, bruno, item, token };
}

function patchItem(token: string, id: string, body: object) {
  return request(app)
    .patch(`/api/objetos/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

function getMyItems(token: string) {
  return request(app)
    .get('/api/usuarios/me/objetos')
    .set('Authorization', `Bearer ${token}`);
}

beforeEach(async () => {
  await resetDb();
});

describe('GET /api/usuarios/me/objetos', () => {
  it('returns 401 without a session', async () => {
    const response = await request(app).get('/api/usuarios/me/objetos');

    expect(response.status).toBe(401);
  });

  it('returns an empty list when the user has no items', async () => {
    await createTestUser();
    const token = await loginAs('ana@rentit.test');

    const response = await getMyItems(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns exactly the agreed fields, with the amount as text', async () => {
    const { ana, token } = await setUp();
    await prisma.item.deleteMany();
    const item = await createTestItem(ana.id, { dailyPrice: 5.5 });

    const response = await getMyItems(token);

    expect(response.body).toEqual([
      {
        id: item.id,
        title: item.title,
        dailyPrice: '5.50',
        neighborhood: item.neighborhood,
        status: 'published',
      },
    ]);
  });

  it('includes the items in every status', async () => {
    const { ana, token } = await setUp();
    await createTestItem(ana.id, { status: 'paused' });
    await createTestItem(ana.id, { status: 'withdrawn' });

    const response = await getMyItems(token);

    const statuses = (response.body as Array<{ status: string }>)
      .map(({ status }) => status)
      .sort();
    expect(statuses).toEqual(['paused', 'published', 'withdrawn']);
  });

  it('does not return the items of other users', async () => {
    const { bruno, token } = await setUp();
    const other = await createTestItem(bruno.id, { title: 'Escalera' });

    const response = await getMyItems(token);

    const ids = (response.body as Array<{ id: string }>).map(({ id }) => id);
    expect(ids).not.toContain(other.id);
    expect(ids).toHaveLength(1);
  });

  it('sorts from newest to oldest', async () => {
    const { ana, item: older, token } = await setUp();
    const newer = await createTestItem(ana.id, { title: 'Escalera' });
    await prisma.item.update({
      where: { id: older.id },
      data: { createdAt: new Date('2026-01-01T10:00:00.000Z') },
    });
    await prisma.item.update({
      where: { id: newer.id },
      data: { createdAt: new Date('2026-01-02T10:00:00.000Z') },
    });

    const response = await getMyItems(token);

    const ids = (response.body as Array<{ id: string }>).map(({ id }) => id);
    expect(ids).toEqual([newer.id, older.id]);
  });
});

describe('PATCH /api/objetos/:id', () => {
  it('saves the changes and returns the item like the detail endpoint', async () => {
    const { ana, item, token } = await setUp();

    const response = await patchItem(token, item.id, VALID_CHANGES);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: item.id,
      title: 'Taladro nuevo',
      description: 'Con maletín y brocas nuevas.',
      dailyPrice: '7.50',
      deposit: '40.00',
      neighborhood: item.neighborhood,
      status: 'published',
      owner: { id: ana.id, username: 'ana' },
      photos: [],
    });
    expect(response.body.category).toEqual({
      id: item.categoryId,
      name: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain('@rentit.test');

    const saved = await prisma.item.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(saved.title).toBe('Taladro nuevo');
    expect(saved.dailyPrice.toFixed(2)).toBe('7.50');
    expect(saved.deposit.toFixed(2)).toBe('40.00');
  });

  it('trims the texts and accepts a deposit of 0', async () => {
    const { item, token } = await setUp();

    const response = await patchItem(token, item.id, {
      ...VALID_CHANGES,
      title: '  Taladro  ',
      deposit: 0,
    });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Taladro');
    expect(response.body.deposit).toBe('0.00');
  });

  it('does not change fields that cannot be edited', async () => {
    const { ana, bruno, item, token } = await setUp();

    const response = await patchItem(token, item.id, {
      ...VALID_CHANGES,
      status: 'withdrawn',
      ownerId: bruno.id,
    });

    expect(response.status).toBe(200);
    const saved = await prisma.item.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(saved.status).toBe('published');
    expect(saved.ownerId).toBe(ana.id);
  });

  it('returns 401 without a session', async () => {
    const { item } = await setUp();

    const response = await request(app)
      .patch(`/api/objetos/${item.id}`)
      .send(VALID_CHANGES);

    expect(response.status).toBe(401);
  });

  it('returns 403 when the user is not the owner and changes nothing', async () => {
    const { item } = await setUp();
    const brunoToken = await loginAs('bruno@rentit.test');

    const response = await patchItem(brunoToken, item.id, VALID_CHANGES);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Solo el propietario puede editar este objeto.',
    });
    const saved = await prisma.item.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(saved.title).toBe(item.title);
  });

  it.each([
    ['that does not exist', '00000000-0000-4000-8000-000000000000'],
    ['with an id that is not a UUID', 'no-es-un-uuid'],
  ])('returns 404 for an item %s', async (_case, id) => {
    const { token } = await setUp();

    const response = await patchItem(token, id, VALID_CHANGES);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'No hemos encontrado este objeto.',
    });
  });

  it.each([
    ['title', 'nombre', { title: '   ' }],
    ['title', 'nombre', { title: 'x'.repeat(101) }],
    ['title', 'nombre', { title: undefined }],
    ['description', 'descripción', { description: '' }],
    ['description', 'descripción', { description: 'x'.repeat(2001) }],
    ['dailyPrice', 'precio por día', { dailyPrice: 0 }],
    ['dailyPrice', 'precio por día', { dailyPrice: -1 }],
    ['dailyPrice', 'precio por día', { dailyPrice: 1.234 }],
    ['dailyPrice', 'precio por día', { dailyPrice: 100_000_000 }],
    ['dailyPrice', 'precio por día', { dailyPrice: 'mucho' }],
    ['deposit', 'fianza', { deposit: -1 }],
    ['deposit', 'fianza', { deposit: undefined }],
  ])(
    'returns 400 for an invalid %s (%s, %j) and changes nothing',
    async (field, label, overrides) => {
      const { item, token } = await setUp();

      const response = await patchItem(token, item.id, {
        ...VALID_CHANGES,
        ...overrides,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: `El campo "${label}" no es correcto, revísalo.`,
        field,
      });
      const saved = await prisma.item.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(saved.title).toBe(item.title);
    },
  );
});
