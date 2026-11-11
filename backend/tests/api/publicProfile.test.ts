import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Perfil público de un usuario (US-01.4, #300). El bucket se sustituye por uno que solo
// firma URLs: lo que se prueba son las reglas del backend, no el proveedor de S3.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026

const bucket = vi.hoisted(() => ({ configured: true }));

vi.mock('../../src/repositories/photoStorage.js', () => ({
  UPLOAD_URL_SECONDS: 300,
  VIEW_URL_SECONDS: 3600,
  isStorageConfigured: () => bucket.configured,
  createViewUrl: async (key: string) => `https://s3.test/ver/${key}`,
}));

const NOT_FOUND = { error: 'No hemos encontrado este usuario.' };

beforeEach(async () => {
  await resetDb();
  bucket.configured = true;
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

async function twoUsers() {
  const ana = await createTestUser({
    username: 'ana',
    email: 'ana@rentit.test',
  });
  const bruno = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  return { ana, bruno };
}

describe('GET /api/usuarios/:id', () => {
  it('es público: sin sesión devuelve el perfil sin datos privados', async () => {
    const { ana } = await twoUsers();
    await prisma.user.update({
      where: { id: ana.id },
      data: {
        bio: 'Presto herramientas.',
        photoUrl: `usuarios/${ana.id}/a.png`,
      },
    });

    const response = await request(app).get(`/api/usuarios/${ana.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: ana.id,
      username: 'ana',
      bio: 'Presto herramientas.',
      photo: `https://s3.test/ver/usuarios/${ana.id}/a.png`,
      memberSince: ana.createdAt.toISOString(),
      rating: { average: null, count: 0 },
      items: [],
      isOwnProfile: false,
    });
  });

  it('no incluye nunca el correo ni otros datos privados', async () => {
    const { ana } = await twoUsers();
    await createTestItem(ana.id);
    const token = await loginAs('ana@rentit.test');

    for (const headers of [{}, { Authorization: `Bearer ${token}` }]) {
      const response = await request(app)
        .get(`/api/usuarios/${ana.id}`)
        .set(headers);
      const text = JSON.stringify(response.body);

      expect(text).not.toContain('ana@rentit.test');
      expect(text).not.toContain(ana.passwordHash);
      expect(response.body).not.toHaveProperty('email');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('role');
      expect(response.body).not.toHaveProperty('status');
      expect(response.body).not.toHaveProperty('isRider');
    }
  });

  it('con bio y foto vacías devuelve null y, sin almacenamiento, la foto es null', async () => {
    const { ana } = await twoUsers();
    await prisma.user.update({
      where: { id: ana.id },
      data: { photoUrl: `usuarios/${ana.id}/a.png` },
    });
    bucket.configured = false;

    const response = await request(app).get(`/api/usuarios/${ana.id}`);

    expect(response.status).toBe(200);
    expect(response.body.bio).toBeNull();
    expect(response.body.photo).toBeNull();
  });

  it('isOwnProfile es true solo para el propio usuario', async () => {
    const { ana, bruno } = await twoUsers();
    const token = await loginAs('ana@rentit.test');
    const auth = { Authorization: `Bearer ${token}` };

    const own = await request(app).get(`/api/usuarios/${ana.id}`).set(auth);
    const other = await request(app).get(`/api/usuarios/${bruno.id}`).set(auth);
    const invalidToken = await request(app)
      .get(`/api/usuarios/${ana.id}`)
      .set('Authorization', 'Bearer token-falso');

    expect(own.body.isOwnProfile).toBe(true);
    expect(other.body.isOwnProfile).toBe(false);
    expect(invalidToken.status).toBe(200);
    expect(invalidToken.body.isOwnProfile).toBe(false);
  });

  it('lista solo los objetos publicados, el más nuevo primero, con su primera foto', async () => {
    const { ana, bruno } = await twoUsers();
    const old = await createTestItem(ana.id, {
      title: 'Taladro',
      dailyPrice: 5,
    });
    const recent = await createTestItem(ana.id, {
      title: 'Escalera',
      dailyPrice: 7.5,
      neighborhood: 'Sants',
    });
    await createTestItem(ana.id, { title: 'Pausado', status: 'paused' });
    await createTestItem(ana.id, { title: 'Retirado', status: 'withdrawn' });
    await createTestItem(bruno.id, { title: 'De bruno' });
    await prisma.item.update({
      where: { id: old.id },
      data: { createdAt: new Date('2026-01-01T00:00:00Z') },
    });
    await prisma.itemPhoto.createMany({
      data: [
        { itemId: recent.id, key: `objetos/${recent.id}/2.png`, order: 2 },
        { itemId: recent.id, key: `objetos/${recent.id}/1.png`, order: 1 },
      ],
    });

    const response = await request(app).get(`/api/usuarios/${ana.id}`);

    expect(response.body.items).toEqual([
      {
        id: recent.id,
        title: 'Escalera',
        dailyPrice: '7.50',
        neighborhood: 'Sants',
        photo: `https://s3.test/ver/objetos/${recent.id}/1.png`,
      },
      {
        id: old.id,
        title: 'Taladro',
        dailyPrice: '5.00',
        neighborhood: 'Gràcia',
        photo: null,
      },
    ]);
  });

  it.each([
    ['un id que no es un UUID', 'no-es-un-uuid'],
    ['un usuario que no existe', '3f2b8c1e-6d4a-4f0e-9a57-1c2d3e4f5a6b'],
  ])('responde 404 con %s', async (_name, id) => {
    const response = await request(app).get(`/api/usuarios/${id}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND);
  });

  it('responde 404 con un usuario bloqueado', async () => {
    const blocked = await createTestUser({
      username: 'malo',
      email: 'malo@rentit.test',
      status: 'blocked',
    });

    const response = await request(app).get(`/api/usuarios/${blocked.id}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND);
  });

  it('no tapa a /api/usuarios/me, que sigue exigiendo sesión y devolviendo el perfil privado', async () => {
    await twoUsers();
    const token = await loginAs('ana@rentit.test');

    const anonymous = await request(app).get('/api/usuarios/me');
    const authenticated = await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${token}`);

    expect(anonymous.status).toBe(401);
    expect(authenticated.status).toBe(200);
    expect(authenticated.body.email).toBe('ana@rentit.test');
  });
});

const INVALID_BIO = {
  error: 'El campo "bio" no es correcto, revísalo.',
  field: 'bio',
};

describe('PATCH /api/usuarios/me', () => {
  async function patch(body: unknown, email = 'ana@rentit.test') {
    const token = await loginAs(email);
    return request(app)
      .patch('/api/usuarios/me')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);
  }

  it('guarda la bio recortada y devuelve el perfil propio', async () => {
    const { ana } = await twoUsers();
    await createTestItem(ana.id);

    const response = await patch({ bio: '  Vivo en Gràcia.  ' });

    expect(response.status).toBe(200);
    expect(response.body.bio).toBe('Vivo en Gràcia.');
    expect(response.body.isOwnProfile).toBe(true);
    expect(response.body.items).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('ana@rentit.test');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).bio,
    ).toBe('Vivo en Gràcia.');
  });

  it.each(['', '   \n '])('una bio en blanco (%j) la borra', async (bio) => {
    const { ana } = await twoUsers();
    await prisma.user.update({ where: { id: ana.id }, data: { bio: 'Antes' } });

    const response = await patch({ bio });

    expect(response.status).toBe(200);
    expect(response.body.bio).toBeNull();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).bio,
    ).toBeNull();
  });

  it('acepta 500 caracteres y rechaza 501', async () => {
    const { ana } = await twoUsers();

    const ok = await patch({ bio: 'a'.repeat(500) });
    const tooLong = await patch({ bio: 'a'.repeat(501) });

    expect(ok.status).toBe(200);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body).toEqual(INVALID_BIO);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).bio,
    ).toBe('a'.repeat(500));
  });

  it.each([[42], [null], [['a']], [{}], [undefined]])(
    'rechaza una bio que no es texto (%j)',
    async (bio) => {
      await twoUsers();

      const response = await patch({ bio });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_BIO);
    },
  );

  it('rechaza un cuerpo ausente', async () => {
    await twoUsers();
    const token = await loginAs('ana@rentit.test');

    const response = await request(app)
      .patch('/api/usuarios/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual(INVALID_BIO);
  });

  it('sin sesión responde 401', async () => {
    await twoUsers();

    const response = await request(app)
      .patch('/api/usuarios/me')
      .send({ bio: 'Hola' });

    expect(response.status).toBe(401);
  });

  it('ignora el resto de campos: el nombre, el correo y el rol no cambian', async () => {
    const { ana } = await twoUsers();

    const response = await patch({
      bio: 'Hola',
      username: 'otro',
      email: 'otro@rentit.test',
      role: 'admin',
    });

    expect(response.status).toBe(200);
    expect(response.body.username).toBe('ana');
    const saved = await prisma.user.findUniqueOrThrow({
      where: { id: ana.id },
    });
    expect(saved.username).toBe('ana');
    expect(saved.email).toBe('ana@rentit.test');
    expect(saved.role).toBe('user');
  });

  it('solo cambia el perfil de quien tiene la sesión', async () => {
    const { bruno } = await twoUsers();

    await patch({ bio: 'Mía' });

    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: bruno.id } })).bio,
    ).toBeNull();
  });
});
