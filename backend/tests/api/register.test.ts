import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { hashToken } from '../../src/services/sessionService.js';
import { resetDb } from '../helpers/db.js';

const invalidField = (label: string, field: string) => ({
  error: `El campo "${label}" no está correctamente introducido, prueba a revisarlo.`,
  field,
});

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/auth/register', () => {
  it('creates the user and session and returns the public login response', async () => {
    const response = await request(app).post('/api/auth/register').send({
      username: 'ana',
      email: 'ana@rentit.test',
      password: 'contraseña-segura',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      token: expect.any(String),
      expiresAt: expect.any(String),
      user: {
        id: expect.any(String),
        username: 'ana',
        email: 'ana@rentit.test',
        role: 'user',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: response.body.user.id as string },
    });
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: user.id },
    });

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.session.count()).toBe(1);
    expect(user.passwordHash).not.toBe('contraseña-segura');
    expect(session.tokenHash).toBe(hashToken(response.body.token as string));

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${response.body.token as string}`);
    expect(logout.status).toBe(204);
  });

  it('trims the username and normalizes the email', async () => {
    const response = await request(app).post('/api/auth/register').send({
      username: ' ana2 ',
      email: ' Ana2@Rentit.TEST ',
      password: '12345678',
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      username: 'ana2',
      email: 'ana2@rentit.test',
    });
    expect(
      await prisma.user.findUnique({ where: { username: 'ana2' } }),
    ).not.toBeNull();
  });

  it.each([
    [{}, invalidField('nombre de usuario', 'username')],
    [
      { username: 'ab', email: 'ana@rentit.test', password: '12345678' },
      invalidField('nombre de usuario', 'username'),
    ],
    [
      {
        username: 'a'.repeat(31),
        email: 'ana@rentit.test',
        password: '12345678',
      },
      invalidField('nombre de usuario', 'username'),
    ],
    [
      {
        username: 'ana usuario',
        email: 'ana@rentit.test',
        password: '12345678',
      },
      invalidField('nombre de usuario', 'username'),
    ],
    [
      {
        username: 'ana@',
        email: 'ana@rentit.test',
        password: '12345678',
      },
      invalidField('nombre de usuario', 'username'),
    ],
    [
      { username: 'ana', email: 'correo-inválido', password: '12345678' },
      invalidField('correo electrónico', 'email'),
    ],
    [
      { username: 'ana', password: '12345678' },
      invalidField('correo electrónico', 'email'),
    ],
    [
      {
        username: 'ana',
        email: `${'a'.repeat(247)}@test.com`,
        password: '12345678',
      },
      invalidField('correo electrónico', 'email'),
    ],
    [
      { username: 'ana', email: 'ana@rentit.test' },
      invalidField('contraseña', 'password'),
    ],
    [
      { username: 'ana', email: 'ana@rentit.test', password: '1234567' },
      invalidField('contraseña', 'password'),
    ],
    [
      {
        username: 'ana',
        email: 'ana@rentit.test',
        password: 'ñ'.repeat(37),
      },
      invalidField('contraseña', 'password'),
    ],
  ])('returns 400 for invalid registration data %j', async (body, expected) => {
    const response = await request(app).post('/api/auth/register').send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual(expected);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
  });

  it('returns 409 when the email is already registered, regardless of case', async () => {
    await prisma.user.create({
      data: {
        username: 'existing',
        email: 'ana@rentit.test',
        passwordHash: 'not-used',
      },
    });

    const response = await request(app).post('/api/auth/register').send({
      username: 'another',
      email: ' ANA@Rentit.TEST ',
      password: '12345678',
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Ya existe una cuenta con este correo electrónico.',
      field: 'email',
    });
  });

  it('returns 409 when the username is already registered', async () => {
    await prisma.user.create({
      data: {
        username: 'ana',
        email: 'existing@rentit.test',
        passwordHash: 'not-used',
      },
    });

    const response = await request(app).post('/api/auth/register').send({
      username: ' ana ',
      email: 'another@rentit.test',
      password: '12345678',
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Este nombre de usuario ya está en uso.',
      field: 'username',
    });
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"username":');

    expect(response.status).toBe(400);
  });
});
