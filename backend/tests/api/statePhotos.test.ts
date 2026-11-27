import type { DeliveryMode } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Fotos del estado antes de entregar el objeto (US-09.02, #77, tarea #454). El bucket se sustituye
// por uno en memoria, como en photos.test.ts: se prueban las reglas del backend, no el proveedor.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 27/11/2026

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

const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const SVG_BYTES = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
const PHOTO = { contentType: 'image/jpeg', size: JPEG_BYTES.length };

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

// ana publica, bruno alquila y rita es la rider. La reserva está pagada y el objeto aún no ha
// salido de casa de ana.
async function setUp(mode: DeliveryMode = 'home') {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const rider = await createTestUser({
    username: 'rita',
    email: 'rita@rentit.test',
  });
  await createTestUser({ username: 'carla', email: 'carla@rentit.test' });
  const item = await createTestItem(owner.id, {
    homeDelivery: true,
    riderDelivery: true,
  });
  const reservation = await createTestReservation(item.id, renter.id, {
    status: 'paid',
  });
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      deliveryMode: mode,
      delivery: {
        create:
          mode === 'rider'
            ? {
                riderId: rider.id,
                deliveryCode: '048213',
                status: 'assigned',
                assignedAt: new Date(),
              }
            : {},
      },
    },
  });

  return {
    id: reservation.id,
    owner,
    ownerToken: await loginAs('ana@rentit.test'),
    renterToken: await loginAs('bruno@rentit.test'),
    riderToken: await loginAs('rita@rentit.test'),
    strangerToken: await loginAs('carla@rentit.test'),
  };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function getPhotos(id: string, token: string) {
  return request(app).get(`/api/entregas/${id}/fotos`).set(auth(token));
}

function askUpload(id: string, token: string, body: unknown = PHOTO) {
  return request(app)
    .post(`/api/entregas/${id}/fotos/entrega/subida`)
    .set(auth(token))
    .send(body as object);
}

function saveKey(id: string, token: string, key: unknown) {
  return request(app)
    .post(`/api/entregas/${id}/fotos/entrega`)
    .set(auth(token))
    .send({ key });
}

function confirmPhotos(id: string, token: string) {
  return request(app)
    .post(`/api/entregas/${id}/fotos/entrega/confirmar`)
    .set(auth(token));
}

// Pide la URL, «sube» el fichero al bucket en memoria y confirma la clave.
async function uploadPhoto(id: string, token: string, bytes = JPEG_BYTES) {
  const asked = await askUpload(id, token);
  expect(asked.status).toBe(201);
  bucket.files.set(asked.body.key, { contentType: 'image/jpeg', bytes });
  return saveKey(id, token, asked.body.key);
}

describe('GET /api/entregas/:id/fotos', () => {
  it('shows the owner an empty delivery phase that she can still edit', async () => {
    const { id, ownerToken } = await setUp();

    const response = await getPhotos(id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      delivery: { photos: [], confirmedAt: null, canEdit: true },
    });
  });

  it('shows the renter the photos, with their time, but he cannot edit them', async () => {
    const { id, ownerToken, renterToken } = await setUp();
    await uploadPhoto(id, ownerToken);

    const response = await getPhotos(id, renterToken);

    expect(response.status).toBe(200);
    expect(response.body.delivery).toEqual({
      photos: [
        {
          id: expect.any(String),
          order: 1,
          url: expect.stringMatching(
            new RegExp(`^https://s3\\.test/ver/reservas/${id}/entrega/`),
          ),
          createdAt: expect.any(String),
        },
      ],
      confirmedAt: null,
      canEdit: false,
    });
  });

  it('returns the photos without URL when there is no storage', async () => {
    const { id, ownerToken } = await setUp();
    await uploadPhoto(id, ownerToken);
    bucket.configured = false;

    const response = await getPhotos(id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body.delivery.photos[0].url).toBeNull();
  });

  it.each([
    ['the rider', 'riderToken'],
    ['someone outside the reservation', 'strangerToken'],
  ] as const)('returns 403 to %s', async (_, who) => {
    const users = await setUp('rider');

    const response = await getPhotos(users.id, users[who]);

    expect(response.status).toBe(403);
  });

  it('returns 401 without a session', async () => {
    const { id } = await setUp();

    expect((await request(app).get(`/api/entregas/${id}/fotos`)).status).toBe(
      401,
    );
  });
});

describe('POST /api/entregas/:id/fotos/entrega/subida', () => {
  it('gives the owner an upload URL in the folder of the reservation', async () => {
    const { id, ownerToken } = await setUp();

    const response = await askUpload(id, ownerToken);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      key: expect.stringMatching(
        new RegExp(`^reservas/${id}/entrega/[0-9a-f-]{36}\\.jpg$`),
      ),
      uploadUrl: expect.stringContaining('https://s3.test/subir/'),
      expiresIn: 300,
    });
  });

  it('returns 403 to the renter', async () => {
    const { id, renterToken } = await setUp();

    const response = await askUpload(id, renterToken);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Solo el propietario puede subir las fotos del estado.',
    });
  });

  it('returns 404 for an unknown phase', async () => {
    const { id, ownerToken } = await setUp();

    const response = await request(app)
      .post(`/api/entregas/${id}/fotos/otra/subida`)
      .set(auth(ownerToken))
      .send(PHOTO);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'No existe esa fase de fotos.' });
  });

  it('returns 400 for a file that is not JPG, PNG or WebP', async () => {
    const { id, ownerToken } = await setUp();

    const response = await askUpload(id, ownerToken, {
      contentType: 'image/svg+xml',
      size: 100,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Solo se pueden subir fotos JPG, PNG o WebP.',
      field: 'contentType',
    });
  });

  it.each(['picked_up', 'delivered'] as const)(
    'returns 409 once the object has left the owner (%s)',
    async (status) => {
      const { id, ownerToken } = await setUp('rider');
      await prisma.delivery.update({
        where: { reservationId: id },
        data: {
          status,
          pickedUpAt: new Date(),
          deliveredAt: status === 'delivered' ? new Date() : null,
        },
      });

      const response = await askUpload(id, ownerToken);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: 'Las fotos de la entrega se suben antes de entregar el objeto.',
      });
    },
  );

  it('returns 409 when there are already 5 photos', async () => {
    const { id, ownerToken } = await setUp();
    for (let i = 0; i < 5; i++) {
      expect((await uploadPhoto(id, ownerToken)).status).toBe(201);
    }

    const response = await askUpload(id, ownerToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Ya hay 5 fotos, que es el máximo.',
    });
  });
});

describe('POST /api/entregas/:id/fotos/entrega', () => {
  it('saves the key of a valid photo with the next order', async () => {
    const { id, ownerToken } = await setUp();
    await uploadPhoto(id, ownerToken);

    const response = await uploadPhoto(id, ownerToken);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      order: 2,
      url: expect.stringContaining('https://s3.test/ver/reservas/'),
      createdAt: expect.any(String),
    });
    const saved = await prisma.statePhoto.findMany({
      where: { reservationId: id },
    });
    expect(saved).toHaveLength(2);
    expect(saved.every(({ phase }) => phase === 'delivery')).toBe(true);
  });

  it('returns 400 for a key outside the folder of the reservation', async () => {
    const { id, ownerToken } = await setUp();

    const response = await saveKey(
      id,
      ownerToken,
      'objetos/otro/00000000-0000-4000-8000-000000000000.jpg',
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'La clave de la foto no es válida.',
      field: 'key',
    });
  });

  it('rejects and deletes a file that is not really an image', async () => {
    const { id, ownerToken } = await setUp();

    const response = await uploadPhoto(id, ownerToken, SVG_BYTES);

    expect(response.status).toBe(400);
    expect(bucket.deleted).toHaveLength(1);
    expect(await prisma.statePhoto.count()).toBe(0);
  });
});

describe('DELETE /api/entregas/:id/fotos/entrega/:fotoId', () => {
  it('lets the owner remove a photo before confirming, also from the bucket', async () => {
    const { id, ownerToken } = await setUp();
    const uploaded = await uploadPhoto(id, ownerToken);

    const response = await request(app)
      .delete(`/api/entregas/${id}/fotos/entrega/${uploaded.body.id}`)
      .set(auth(ownerToken));

    expect(response.status).toBe(204);
    expect(await prisma.statePhoto.count()).toBe(0);
    expect(bucket.deleted).toHaveLength(1);
  });

  it('returns 404 for a photo that does not exist', async () => {
    const { id, ownerToken } = await setUp();

    const response = await request(app)
      .delete(
        `/api/entregas/${id}/fotos/entrega/00000000-0000-4000-8000-000000000000`,
      )
      .set(auth(ownerToken));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'No existe esa foto.' });
  });
});

describe('POST /api/entregas/:id/fotos/entrega/confirmar («Confirmar fotos»)', () => {
  it('returns 400 without any photo', async () => {
    const { id, ownerToken } = await setUp();

    const response = await confirmPhotos(id, ownerToken);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Sube al menos una foto.' });
  });

  it('locks the photos with the time of the confirmation', async () => {
    const { id, ownerToken } = await setUp();
    await uploadPhoto(id, ownerToken);
    await uploadPhoto(id, ownerToken);

    const response = await confirmPhotos(id, ownerToken);

    expect(response.status).toBe(200);
    expect(response.body.delivery.photos).toHaveLength(2);
    expect(response.body.delivery.confirmedAt).toEqual(expect.any(String));
    expect(response.body.delivery.canEdit).toBe(false);
  });

  it('after confirming, nothing can be added, removed or confirmed again', async () => {
    const { id, ownerToken } = await setUp();
    const uploaded = await uploadPhoto(id, ownerToken);
    await confirmPhotos(id, ownerToken);
    const locked = {
      error: 'Las fotos ya están confirmadas y no se pueden cambiar.',
    };

    const add = await askUpload(id, ownerToken);
    const remove = await request(app)
      .delete(`/api/entregas/${id}/fotos/entrega/${uploaded.body.id}`)
      .set(auth(ownerToken));
    const again = await confirmPhotos(id, ownerToken);

    for (const response of [add, remove, again]) {
      expect(response.status).toBe(409);
      expect(response.body).toEqual(locked);
    }
    expect(await prisma.statePhoto.count()).toBe(1);
  });

  it('returns 403 to the renter', async () => {
    const { id, ownerToken, renterToken } = await setUp();
    await uploadPhoto(id, ownerToken);

    expect((await confirmPhotos(id, renterToken)).status).toBe(403);
  });

  it('once confirmed, the renter can mark «Ya tengo el objeto»', async () => {
    const { id, ownerToken, renterToken } = await setUp('home');
    await uploadPhoto(id, ownerToken);
    await confirmPhotos(id, ownerToken);

    const response = await request(app)
      .post(`/api/entregas/${id}/recibida`)
      .set(auth(renterToken));

    expect(response.status).toBe(200);
    expect(response.body.reservationStatus).toBe('in_progress');
  });
});
