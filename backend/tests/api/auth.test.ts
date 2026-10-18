import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

const INVALID_EMAIL = {
  error: 'El campo "correo electrónico" no es correcto, revísalo.',
  field: 'email',
};
const INVALID_PASSWORD = {
  error: 'El campo "contraseña" no es correcto, revísalo.',
  field: 'password',
};

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/auth/login', () => {
  it('returns a token and the public user data with correct credentials', async () => {
    const user = await createTestUser();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@rentit.test', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      token: expect.any(String),
      expiresAt: expect.any(String),
      user: {
        id: user.id,
        username: 'ana',
        email: 'ana@rentit.test',
        role: 'user',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it('accepts the email with spaces and capital letters', async () => {
    await createTestUser();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: '  Ana@Rentit.TEST ', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
  });

  it('returns 401 on the email field when the email is not registered', async () => {
    await createTestUser();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@rentit.test', password: TEST_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_EMAIL);
  });

  it('returns 401 on the password field when the password is wrong', async () => {
    await createTestUser();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@rentit.test', password: 'otra-contraseña' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_PASSWORD);
    expect(await prisma.session.count()).toBe(0);
  });

  it.each([
    [{}, INVALID_EMAIL],
    [{ email: 'no-es-un-email', password: TEST_PASSWORD }, INVALID_EMAIL],
    [{ email: 'ana@rentit.test' }, INVALID_PASSWORD],
    [{ email: 'ana@rentit.test', password: '' }, INVALID_PASSWORD],
  ])('returns 400 for invalid data %j', async (body, expected) => {
    const response = await request(app).post('/api/auth/login').send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual(expected);
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
  });

  it('returns 403 and creates no session for a blocked user', async () => {
    await createTestUser({ status: 'blocked' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@rentit.test', password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(await prisma.session.count()).toBe(0);
  });
});
