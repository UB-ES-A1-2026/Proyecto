import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

const INVALID_SESSION = {
  error: 'Sesión no válida o caducada. Inicia sesión de nuevo.',
};

beforeEach(async () => {
  await resetDb();
});

async function loginAs(): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ana@rentit.test', password: TEST_PASSWORD });
  return response.body.token as string;
}

describe('GET /api/usuarios/me', () => {
  it('returns exactly the authenticated user public profile', async () => {
    const user = await createTestUser();
    const token = await loginAs();

    const response = await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: user.id,
      username: 'ana',
      email: 'ana@rentit.test',
      role: 'user',
      createdAt: user.createdAt.toISOString(),
    });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('status');
    expect(response.body).not.toHaveProperty('updatedAt');
    expect(response.body).not.toHaveProperty('session');
  });

  it.each([
    ['without an Authorization header', undefined],
    ['with a false token', 'Bearer token-falso'],
    ['with another scheme', 'Basic abc'],
  ])('returns 401 %s', async (_case, authorization) => {
    const call = request(app).get('/api/usuarios/me');
    const response = await (authorization
      ? call.set('Authorization', authorization)
      : call);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_SESSION);
  });

  it('returns 401 after the session is revoked', async () => {
    await createTestUser();
    const token = await loginAs();
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    const response = await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_SESSION);
  });

  it('returns 401 when the session has expired', async () => {
    const user = await createTestUser();
    const token = await loginAs();
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_SESSION);
  });
});
