import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Las fotos subidas se ven en la ficha, en la edición y en la búsqueda (#243). El bucket se
// sustituye por uno falso: lo que se prueba es qué devuelve cada endpoint.

const storage = vi.hoisted(() => ({ configured: true }));

vi.mock('../../src/repositories/photoStorage.js', () => ({
  isStorageConfigured: () => storage.configured,
  createViewUrl: async (key: string) => `https://s3.test/ver/${key}`,
}));

beforeEach(async () => {
  await resetDb();
  storage.configured = true;
});

async function addPhoto(itemId: string, key: string, order: number) {
  return prisma.itemPhoto.create({ data: { itemId, key, order } });
}

describe('GET /api/objetos/:id', () => {
  it('devuelve las fotos en orden, con su URL y sin la clave', async () => {
    const ana = await createTestUser();
    const item = await createTestItem(ana.id);
    const second = await addPhoto(item.id, 'objetos/segunda.webp', 2);
    const first = await addPhoto(item.id, 'objetos/primera.webp', 1);

    const response = await request(app).get(`/api/objetos/${item.id}`);

    expect(response.status).toBe(200);
    expect(response.body.photos).toEqual([
      { id: first.id, url: 'https://s3.test/ver/objetos/primera.webp' },
      { id: second.id, url: 'https://s3.test/ver/objetos/segunda.webp' },
    ]);
  });

  it('sin almacenamiento configurado no falla y no devuelve fotos', async () => {
    const ana = await createTestUser();
    const item = await createTestItem(ana.id);
    await addPhoto(item.id, 'objetos/primera.webp', 1);
    storage.configured = false;

    const response = await request(app).get(`/api/objetos/${item.id}`);

    expect(response.status).toBe(200);
    expect(response.body.photos).toEqual([]);
  });
});

describe('PATCH /api/objetos/:id', () => {
  it('devuelve las fotos que ya tiene el objeto', async () => {
    const ana = await createTestUser();
    const item = await createTestItem(ana.id);
    const photo = await addPhoto(item.id, 'objetos/primera.webp', 1);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: ana.email, password: TEST_PASSWORD });

    const response = await request(app)
      .patch(`/api/objetos/${item.id}`)
      .set('Authorization', `Bearer ${login.body.token as string}`)
      .send({
        title: 'Taladro nuevo',
        description: 'Con maletín y brocas nuevas.',
        dailyPrice: 7.5,
        deposit: 40,
      });

    expect(response.status).toBe(200);
    expect(response.body.photos).toEqual([
      { id: photo.id, url: 'https://s3.test/ver/objetos/primera.webp' },
    ]);
  });
});

describe('GET /api/usuarios/me/objetos', () => {
  it('devuelve la primera foto de cada objeto, o null si no tiene', async () => {
    const ana = await createTestUser();
    const withPhotos = await createTestItem(ana.id, { title: 'Con fotos' });
    await createTestItem(ana.id, { title: 'Sin fotos' });
    await addPhoto(withPhotos.id, 'objetos/segunda.webp', 2);
    await addPhoto(withPhotos.id, 'objetos/primera.webp', 1);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: ana.email, password: TEST_PASSWORD });

    const response = await request(app)
      .get('/api/usuarios/me/objetos')
      .set('Authorization', `Bearer ${login.body.token as string}`);

    expect(response.status).toBe(200);
    expect(
      Object.fromEntries(
        (response.body as { title: string; photo: string | null }[]).map(
          ({ title, photo }) => [title, photo],
        ),
      ),
    ).toEqual({
      'Con fotos': 'https://s3.test/ver/objetos/primera.webp',
      'Sin fotos': null,
    });
  });
});

describe('GET /api/objetos', () => {
  async function searchPhotos() {
    const response = await request(app).get('/api/objetos?q=taladro');
    expect(response.status).toBe(200);
    return Object.fromEntries(
      (response.body.items as { title: string; photo: string | null }[]).map(
        ({ title, photo }) => [title, photo],
      ),
    );
  }

  it('devuelve la primera foto de cada objeto, o null si no tiene', async () => {
    const ana = await createTestUser();
    const withPhotos = await createTestItem(ana.id, {
      title: 'Taladro con fotos',
    });
    await createTestItem(ana.id, { title: 'Taladro sin fotos' });
    await addPhoto(withPhotos.id, 'objetos/segunda.webp', 2);
    await addPhoto(withPhotos.id, 'objetos/primera.webp', 1);

    expect(await searchPhotos()).toEqual({
      'Taladro con fotos': 'https://s3.test/ver/objetos/primera.webp',
      'Taladro sin fotos': null,
    });
  });

  it('sin almacenamiento configurado no falla y la foto es null', async () => {
    const ana = await createTestUser();
    const item = await createTestItem(ana.id, { title: 'Taladro con fotos' });
    await addPhoto(item.id, 'objetos/primera.webp', 1);
    storage.configured = false;

    expect(await searchPhotos()).toEqual({ 'Taladro con fotos': null });
  });
});
