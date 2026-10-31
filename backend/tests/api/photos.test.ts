import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { listItemPhotos } from '../../src/services/photoService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Subida de fotos de un objeto (US-02.01, #106; ADR 0002). El bucket se sustituye por uno en
// memoria: lo que se prueba son las reglas del backend, no el proveedor de S3.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026

const bucket = vi.hoisted(() => ({
  configured: true,
  files: new Map<string, { contentType: string; bytes: Uint8Array }>(),
  deleted: [] as string[],
}));

vi.mock('../../src/repositories/photoStorage.js', async () => {
  const { AppError } = await import('../../src/errors/appError.js');
  const ensure = () => {
    if (!bucket.configured) {
      throw new AppError(
        503,
        'La subida de fotos no está disponible en este momento.',
      );
    }
  };
  return {
    UPLOAD_URL_SECONDS: 300,
    VIEW_URL_SECONDS: 3600,
    isStorageConfigured: () => bucket.configured,
    createUploadUrl: async (key: string) => {
      ensure();
      return `https://s3.test/subir/${key}`;
    },
    createViewUrl: async (key: string) => {
      ensure();
      return `https://s3.test/ver/${key}`;
    },
    findStoredPhoto: async (key: string) => {
      const file = bucket.files.get(key);
      return file
        ? { size: file.bytes.length, contentType: file.contentType }
        : null;
    },
    readFirstBytes: async (key: string, count: number) =>
      bucket.files.get(key)?.bytes.slice(0, count) ?? new Uint8Array(),
    deleteStoredPhoto: async (key: string) => {
      bucket.files.delete(key);
      bucket.deleted.push(key);
    },
  };
});

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const SVG_BYTES = new TextEncoder().encode('<svg onload="alert(1)"></svg>');

beforeEach(async () => {
  await resetDb();
  bucket.configured = true;
  bucket.files.clear();
  bucket.deleted.length = 0;
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

async function ownerWithItem() {
  const owner = await createTestUser();
  const item = await createTestItem(owner.id);
  return { item, token: await loginAs('ana@rentit.test') };
}

// Simula lo que hace el navegador: pedir la URL y «subir» el fichero al bucket.
async function upload(
  itemId: string,
  token: string,
  bytes: Uint8Array = PNG_BYTES,
  contentType = 'image/png',
): Promise<string> {
  const response = await request(app)
    .post(`/api/objetos/${itemId}/fotos/subida`)
    .set('Authorization', `Bearer ${token}`)
    .send({ contentType: 'image/png', size: bytes.length });
  expect(response.status).toBe(201);
  bucket.files.set(response.body.key, { contentType, bytes });
  return response.body.key as string;
}

function confirm(itemId: string, token: string, key: unknown) {
  return request(app)
    .post(`/api/objetos/${itemId}/fotos`)
    .set('Authorization', `Bearer ${token}`)
    .send({ key });
}

describe('POST /api/objetos/:id/fotos/subida', () => {
  it('da al propietario una URL de subida con una clave decidida por el backend', async () => {
    const { item, token } = await ownerWithItem();

    const response = await request(app)
      .post(`/api/objetos/${item.id}/fotos/subida`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contentType: 'image/webp', size: 2048 });

    expect(response.status).toBe(201);
    expect(response.body.key).toMatch(
      new RegExp(`^objetos/${item.id}/[0-9a-f-]{36}\\.webp$`),
    );
    expect(response.body.uploadUrl).toBe(
      `https://s3.test/subir/${response.body.key}`,
    );
    expect(response.body.expiresIn).toBe(300);
  });

  it('exige sesión', async () => {
    const { item } = await ownerWithItem();

    const response = await request(app)
      .post(`/api/objetos/${item.id}/fotos/subida`)
      .send({ contentType: 'image/png', size: 100 });

    expect(response.status).toBe(401);
  });

  it('solo deja subir fotos al propietario', async () => {
    const { item } = await ownerWithItem();
    await createTestUser({ username: 'bruno', email: 'bruno@rentit.test' });
    const otherToken = await loginAs('bruno@rentit.test');

    const response = await request(app)
      .post(`/api/objetos/${item.id}/fotos/subida`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ contentType: 'image/png', size: 100 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Solo el propietario puede añadir fotos a este objeto.',
    });
  });

  it.each(['no-es-un-uuid', '00000000-0000-4000-8000-000000000000'])(
    'responde 404 si el objeto %s no existe',
    async (itemId) => {
      const { token } = await ownerWithItem();

      const response = await request(app)
        .post(`/api/objetos/${itemId}/fotos/subida`)
        .set('Authorization', `Bearer ${token}`)
        .send({ contentType: 'image/png', size: 100 });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No existe ese objeto.' });
    },
  );

  it('rechaza un SVG y una foto de más de 5 MB indicando el campo', async () => {
    const { item, token } = await ownerWithItem();

    const svg = await request(app)
      .post(`/api/objetos/${item.id}/fotos/subida`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contentType: 'image/svg+xml', size: 100 });
    const big = await request(app)
      .post(`/api/objetos/${item.id}/fotos/subida`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contentType: 'image/jpeg', size: 5 * 1024 * 1024 + 1 });

    expect(svg.status).toBe(400);
    expect(svg.body.field).toBe('contentType');
    expect(big.status).toBe(400);
    expect(big.body).toEqual({
      error: 'La foto no puede ocupar más de 5 MB.',
      field: 'size',
    });
  });

  it('no deja añadir fotos a un objeto retirado', async () => {
    const owner = await createTestUser();
    const item = await createTestItem(owner.id, { status: 'withdrawn' });
    const token = await loginAs('ana@rentit.test');

    const response = await request(app)
      .post(`/api/objetos/${item.id}/fotos/subida`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contentType: 'image/png', size: 100 });

    expect(response.status).toBe(409);
  });

  it('responde 503 si el almacenamiento no está configurado', async () => {
    const { item, token } = await ownerWithItem();
    bucket.configured = false;

    const response = await request(app)
      .post(`/api/objetos/${item.id}/fotos/subida`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contentType: 'image/png', size: 100 });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'La subida de fotos no está disponible en este momento.',
    });
  });
});

describe('POST /api/objetos/:id/fotos', () => {
  it('guarda solo la clave de una foto válida y devuelve su URL de lectura', async () => {
    const { item, token } = await ownerWithItem();
    const key = await upload(item.id, token);

    const response = await confirm(item.id, token, key);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      key,
      order: 1,
      url: `https://s3.test/ver/${key}`,
    });
    expect(
      await prisma.itemPhoto.findMany({ where: { itemId: item.id } }),
    ).toHaveLength(1);
  });

  it('asigna el orden 1, 2, 3… y no deja pasar de 5 fotos', async () => {
    const { item, token } = await ownerWithItem();

    for (let order = 1; order <= 5; order++) {
      const key = await upload(item.id, token);
      expect((await confirm(item.id, token, key)).body.order).toBe(order);
    }

    const sixth = await request(app)
      .post(`/api/objetos/${item.id}/fotos/subida`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contentType: 'image/png', size: 100 });
    expect(sixth.status).toBe(409);
    expect(sixth.body).toEqual({
      error: 'Este objeto ya tiene 5 fotos, que es el máximo.',
    });
  });

  it('borra del bucket y rechaza un fichero que no es una imagen aunque diga que es PNG', async () => {
    const { item, token } = await ownerWithItem();
    const key = await upload(item.id, token, SVG_BYTES, 'image/png');

    const response = await confirm(item.id, token, key);

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('key');
    expect(bucket.deleted).toEqual([key]);
    expect(await prisma.itemPhoto.count()).toBe(0);
  });

  it('borra y rechaza un fichero de más de 5 MB aunque se pidiera la URL para uno pequeño', async () => {
    const { item, token } = await ownerWithItem();
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG_BYTES);
    const key = await upload(item.id, token, PNG_BYTES);
    bucket.files.set(key, { contentType: 'image/png', bytes: big });

    const response = await confirm(item.id, token, key);

    expect(response.status).toBe(400);
    expect(bucket.deleted).toEqual([key]);
  });

  it('rechaza una clave que no es de este objeto o que no se ha subido', async () => {
    const { item, token } = await ownerWithItem();
    const otherItem = await createTestItem(item.ownerId, { title: 'Otro' });
    const otherKey = await upload(otherItem.id, token);

    const foreign = await confirm(item.id, token, otherKey);
    const missing = await confirm(
      item.id,
      token,
      `objetos/${item.id}/00000000-0000-4000-8000-000000000000.png`,
    );
    const invalid = await confirm(item.id, token, '../../otra-cosa.png');

    expect(foreign.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({
      error: 'No se ha subido ninguna foto con esa clave.',
      field: 'key',
    });
    expect(invalid.status).toBe(400);
  });

  it('no guarda dos veces la misma foto', async () => {
    const { item, token } = await ownerWithItem();
    const key = await upload(item.id, token);

    await confirm(item.id, token, key);
    const again = await confirm(item.id, token, key);

    expect(again.status).toBe(409);
    expect(await prisma.itemPhoto.count()).toBe(1);
  });
});

describe('listItemPhotos', () => {
  it('devuelve las fotos en orden con su URL, o [] si no hay almacenamiento', async () => {
    const { item, token } = await ownerWithItem();
    const first = await upload(item.id, token);
    await confirm(item.id, token, first);
    const second = await upload(item.id, token);
    await confirm(item.id, token, second);

    expect(
      (await listItemPhotos(item.id)).map(({ key, order }) => [key, order]),
    ).toEqual([
      [first, 1],
      [second, 2],
    ]);

    bucket.configured = false;
    expect(await listItemPhotos(item.id)).toEqual([]);
  });
});
