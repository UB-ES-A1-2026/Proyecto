import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Foto del perfil en dos pasos (US-01.4, #300; ADR 0002). El bucket se sustituye por uno en
// memoria, igual que en photos.test.ts: se prueban las reglas del backend, no el proveedor.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026

const bucket = vi.hoisted(() => ({
  configured: true,
  failDelete: false,
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
      ensure();
      const file = bucket.files.get(key);
      return file
        ? { size: file.bytes.length, contentType: file.contentType }
        : null;
    },
    readFirstBytes: async (key: string, count: number) =>
      bucket.files.get(key)?.bytes.slice(0, count) ?? new Uint8Array(),
    deleteStoredPhoto: async (key: string) => {
      if (bucket.failDelete) {
        throw new Error('S3 caído');
      }
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
  bucket.failDelete = false;
  bucket.files.clear();
  bucket.deleted.length = 0;
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

async function setup() {
  const ana = await createTestUser();
  const bruno = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  return { ana, bruno, token: await loginAs('ana@rentit.test') };
}

function requestUpload(token: string, body: unknown) {
  return request(app)
    .post('/api/usuarios/me/foto/subida')
    .set('Authorization', `Bearer ${token}`)
    .send(body as object);
}

// Simula lo que hace el navegador: pedir la URL y «subir» el fichero al bucket.
async function upload(
  token: string,
  bytes: Uint8Array = PNG_BYTES,
  contentType = 'image/png',
): Promise<string> {
  const response = await requestUpload(token, {
    contentType: 'image/png',
    size: bytes.length,
  });
  expect(response.status).toBe(201);
  bucket.files.set(response.body.key, { contentType, bytes });
  return response.body.key as string;
}

function confirm(token: string, key: unknown) {
  return request(app)
    .post('/api/usuarios/me/foto')
    .set('Authorization', `Bearer ${token}`)
    .send({ key });
}

async function savedPhoto(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
    .photoUrl;
}

describe('POST /api/usuarios/me/foto/subida', () => {
  it('da una URL de subida con una clave bajo el prefijo del usuario', async () => {
    const { ana, token } = await setup();

    const response = await requestUpload(token, {
      contentType: 'image/webp',
      size: 2048,
    });

    expect(response.status).toBe(201);
    expect(response.body.key).toMatch(
      new RegExp(`^usuarios/${ana.id}/[0-9a-f-]{36}\\.webp$`),
    );
    expect(response.body.uploadUrl).toBe(
      `https://s3.test/subir/${response.body.key}`,
    );
    expect(response.body.expiresIn).toBe(300);
  });

  it.each([
    [{ contentType: 'image/svg+xml', size: 100 }, 'contentType'],
    [{ contentType: 'image/gif', size: 100 }, 'contentType'],
    [{ contentType: 'image/png', size: 5 * 1024 * 1024 + 1 }, 'size'],
    [{ contentType: 'image/png', size: 0 }, 'size'],
    [{ contentType: 'image/png', size: '10' }, 'size'],
    [{}, 'contentType'],
  ])('rechaza %j con 400 y el campo %s', async (body, field) => {
    const { token } = await setup();

    const response = await requestUpload(token, body);

    expect(response.status).toBe(400);
    expect(response.body.field).toBe(field);
  });

  it('exige sesión', async () => {
    await setup();

    const response = await request(app)
      .post('/api/usuarios/me/foto/subida')
      .send({ contentType: 'image/png', size: 10 });

    expect(response.status).toBe(401);
  });

  it('responde 503 si el almacenamiento no está configurado', async () => {
    const { token } = await setup();
    bucket.configured = false;

    const response = await requestUpload(token, {
      contentType: 'image/png',
      size: 10,
    });

    expect(response.status).toBe(503);
  });
});

describe('POST /api/usuarios/me/foto', () => {
  it('guarda la clave y devuelve el perfil con la URL de la foto', async () => {
    const { ana, token } = await setup();
    const key = await upload(token);

    const response = await confirm(token, key);

    expect(response.status).toBe(200);
    expect(response.body.photo).toBe(`https://s3.test/ver/${key}`);
    expect(response.body.isOwnProfile).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('ana@rentit.test');
    expect(await savedPhoto(ana.id)).toBe(key);
  });

  it('al cambiar de foto borra la anterior del bucket', async () => {
    const { ana, token } = await setup();
    const first = await upload(token);
    await confirm(token, first);
    const second = await upload(token);

    const response = await confirm(token, second);

    expect(response.status).toBe(200);
    expect(await savedPhoto(ana.id)).toBe(second);
    expect(bucket.deleted).toEqual([first]);
    expect(bucket.files.has(first)).toBe(false);
    expect(bucket.files.has(second)).toBe(true);
  });

  it('confirmar otra vez la foto actual no la borra', async () => {
    const { ana, token } = await setup();
    const key = await upload(token);
    await confirm(token, key);

    const response = await confirm(token, key);

    expect(response.status).toBe(200);
    expect(bucket.deleted).toEqual([]);
    expect(await savedPhoto(ana.id)).toBe(key);
  });

  it('si no se puede borrar la anterior, la nueva foto se guarda igualmente', async () => {
    const { ana, token } = await setup();
    await confirm(token, await upload(token));
    const second = await upload(token);
    bucket.failDelete = true;

    const response = await confirm(token, second);

    expect(response.status).toBe(200);
    expect(await savedPhoto(ana.id)).toBe(second);
  });

  it('rechaza una clave de otro usuario o inventada con 400', async () => {
    const { ana, bruno, token } = await setup();
    const foreign = `usuarios/${bruno.id}/${'a'.repeat(8)}-aaaa-aaaa-aaaa-${'a'.repeat(12)}.png`;
    bucket.files.set(foreign, { contentType: 'image/png', bytes: PNG_BYTES });

    for (const key of [
      foreign,
      `objetos/${ana.id}/${'a'.repeat(8)}-aaaa-aaaa-aaaa-${'a'.repeat(12)}.png`,
      `usuarios/${ana.id}/../${bruno.id}/x.png`,
      42,
      undefined,
    ]) {
      const response = await confirm(token, key);

      expect(response.status).toBe(400);
      expect(response.body.field).toBe('key');
    }
    expect(await savedPhoto(ana.id)).toBeNull();
    expect(bucket.deleted).toEqual([]);
  });

  it('rechaza una clave sin fichero subido', async () => {
    const { ana, token } = await setup();
    const key = await upload(token);
    bucket.files.delete(key);

    const response = await confirm(token, key);

    expect(response.status).toBe(400);
    expect(await savedPhoto(ana.id)).toBeNull();
  });

  it('rechaza y borra un fichero cuyos bytes no son de una imagen permitida', async () => {
    const { ana, token } = await setup();
    const key = await upload(token, SVG_BYTES);

    const response = await confirm(token, key);

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('key');
    expect(await savedPhoto(ana.id)).toBeNull();
    expect(bucket.deleted).toEqual([key]);
  });

  it('rechaza un fichero cuyo tipo declarado en el bucket no coincide', async () => {
    const { token } = await setup();
    const key = await upload(token, PNG_BYTES, 'text/html');

    const response = await confirm(token, key);

    expect(response.status).toBe(400);
    expect(bucket.deleted).toEqual([key]);
  });

  it('exige sesión', async () => {
    await setup();

    const response = await request(app)
      .post('/api/usuarios/me/foto')
      .send({ key: 'x' });

    expect(response.status).toBe(401);
  });

  it('responde 503 si el almacenamiento no está configurado', async () => {
    const { ana, token } = await setup();
    const key = await upload(token);
    bucket.configured = false;

    const response = await confirm(token, key);

    expect(response.status).toBe(503);
    expect(await savedPhoto(ana.id)).toBeNull();
  });
});

describe('DELETE /api/usuarios/me/foto', () => {
  function remove(token?: string) {
    const call = request(app).delete('/api/usuarios/me/foto');
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  it('quita la foto del perfil y borra el fichero con 204', async () => {
    const { ana, token } = await setup();
    const key = await upload(token);
    await confirm(token, key);

    const response = await remove(token);

    expect(response.status).toBe(204);
    expect(await savedPhoto(ana.id)).toBeNull();
    expect(bucket.deleted).toEqual([key]);
  });

  it('sin foto responde 204 sin tocar el bucket', async () => {
    await setup();
    const token = await loginAs('ana@rentit.test');

    const response = await remove(token);

    expect(response.status).toBe(204);
    expect(bucket.deleted).toEqual([]);
  });

  it('solo quita la foto de quien tiene la sesión', async () => {
    const { bruno, token } = await setup();
    await prisma.user.update({
      where: { id: bruno.id },
      data: { photoUrl: `usuarios/${bruno.id}/x.png` },
    });

    await remove(token);

    expect(await savedPhoto(bruno.id)).toBe(`usuarios/${bruno.id}/x.png`);
  });

  it('exige sesión', async () => {
    await setup();

    expect((await remove()).status).toBe(401);
  });
});
