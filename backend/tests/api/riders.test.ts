// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import * as userRepository from '../../src/repositories/userRepository.js';
import { resetDb } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

const validBody = {
  username: 'carla',
  email: 'carla@rentit.test',
  password: 'contraseña-segura',
  phone: '+34 612 345 678',
  zone: 'Gràcia',
  vehicle: 'bike',
  days: ['monday', 'friday', 'sunday'],
  slots: ['morning', 'night'],
  acceptedTerms: true,
};

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/riders', () => {
  it('creates a rider account with a pending application and no session', async () => {
    const response = await request(app).post('/api/riders').send(validBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message: 'Hemos recibido tu solicitud. Un admin la revisará pronto.',
      status: 'pending',
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'carla@rentit.test' },
      include: { riderApplication: true },
    });
    expect(user).toMatchObject({
      username: 'carla',
      role: 'user',
      isRider: true,
      status: 'active',
    });
    expect(await bcrypt.compare('contraseña-segura', user.passwordHash)).toBe(
      true,
    );
    expect(user.riderApplication).toMatchObject({
      phone: '612345678',
      zone: 'Gràcia',
      vehicle: 'bike',
      days: ['monday', 'friday', 'sunday'],
      slots: ['morning', 'night'],
      status: 'pending',
    });
    expect(user.riderApplication?.termsAcceptedAt).toBeInstanceOf(Date);
    expect(await prisma.session.count()).toBe(0);
    expect(JSON.stringify(response.body)).not.toContain('token');
  });

  it('normalizes the email, the username and the zone', async () => {
    const response = await request(app)
      .post('/api/riders')
      .send({
        ...validBody,
        username: ' carla ',
        email: ' Carla@Rentit.TEST ',
        zone: '  Poblenou ',
      });

    expect(response.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: 'carla' },
      include: { riderApplication: true },
    });
    expect(user.email).toBe('carla@rentit.test');
    expect(user.riderApplication?.zone).toBe('Poblenou');
  });

  it.each([
    [{ username: 'ab' }, 'username'],
    [{ email: 'no-es-correo' }, 'email'],
    [{ password: '1234567' }, 'password'],
    [{ phone: '12345' }, 'phone'],
    [{ zone: ' ' }, 'zone'],
    [{ vehicle: 'helicopter' }, 'vehicle'],
    [{ days: [] }, 'days'],
    [{ days: ['monday', 'monday'] }, 'days'],
    [{ slots: [] }, 'slots'],
    [{ slots: ['dawn'] }, 'slots'],
    [{ acceptedTerms: false }, 'acceptedTerms'],
    [{ acceptedTerms: undefined }, 'acceptedTerms'],
  ])('returns 400 for %j on the field %s', async (override, field) => {
    const response = await request(app)
      .post('/api/riders')
      .send({ ...validBody, ...override });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe(field);
    expect(typeof response.body.error).toBe('string');
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.riderApplication.count()).toBe(0);
  });

  it('returns the agreed messages for the phone and the terms', async () => {
    const phone = await request(app)
      .post('/api/riders')
      .send({ ...validBody, phone: 'abc' });
    expect(phone.body).toEqual({
      error: 'El campo "teléfono" no es correcto, revísalo.',
      field: 'phone',
    });

    const terms = await request(app)
      .post('/api/riders')
      .send({ ...validBody, acceptedTerms: false });
    expect(terms.body).toEqual({
      error: 'Tienes que aceptar las condiciones.',
      field: 'acceptedTerms',
    });
  });

  it('returns 409 when the email is already registered, regardless of case', async () => {
    await createTestUser({ username: 'other', email: 'carla@rentit.test' });

    const response = await request(app)
      .post('/api/riders')
      .send({ ...validBody, email: 'CARLA@rentit.test' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Ya existe una cuenta con este correo.',
      field: 'email',
    });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.riderApplication.count()).toBe(0);
  });

  it('returns 409 when the username is taken', async () => {
    await createTestUser({ username: 'carla', email: 'other@rentit.test' });

    const response = await request(app).post('/api/riders').send(validBody);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Este nombre de usuario ya está en uso.',
      field: 'username',
    });
  });

  it('returns 409, not 500, when two requests race for the same email', async () => {
    const responses = await Promise.all([
      request(app).post('/api/riders').send(validBody),
      request(app)
        .post('/api/riders')
        .send({ ...validBody, username: 'carla2' }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.riderApplication.count()).toBe(1);
  });

  // Se saltan las comprobaciones previas para que sea el INSERT el que choque con la restricción
  // única (P2002): es lo que pasa cuando dos altas simultáneas las superan a la vez.
  it.each([
    ['email', 'Ya existe una cuenta con este correo.', { username: 'carla2' }],
    [
      'username',
      'Este nombre de usuario ya está en uso.',
      { email: 'otra@rentit.test' },
    ],
  ])(
    'returns 409 on the field %s when the unique constraint fails on insert',
    async (field, message, override) => {
      await createTestUser({ username: 'carla', email: 'carla@rentit.test' });
      const byEmail = vi
        .spyOn(userRepository, 'findUserByEmail')
        .mockResolvedValue(null);
      const byUsername = vi
        .spyOn(userRepository, 'findUserByUsername')
        .mockResolvedValue(null);

      const response = await request(app)
        .post('/api/riders')
        .send({ ...validBody, ...override });

      // Las comprobaciones previas se han saltado de verdad: el 409 sale del catch del INSERT.
      expect(byEmail).toHaveBeenCalled();
      expect(byUsername).toHaveBeenCalled();
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: message, field });
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.riderApplication.count()).toBe(0);
    },
  );

  it('ignores role, status and rider flags sent in the body', async () => {
    const response = await request(app)
      .post('/api/riders')
      .send({
        ...validBody,
        role: 'admin',
        isRider: false,
        status: 'blocked',
        riderStatus: 'approved',
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('pending');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'carla@rentit.test' },
      include: { riderApplication: true },
    });
    expect(user).toMatchObject({
      role: 'user',
      isRider: true,
      status: 'active',
    });
    expect(user.riderApplication?.status).toBe('pending');
  });

  it('does not leave a user behind when the application cannot be saved', async () => {
    // Un teléfono de más de 20 caracteres no cabe en la columna: toda la transacción se deshace.
    const { createRiderAccount } =
      await import('../../src/repositories/riderRepository.js');

    await expect(
      createRiderAccount({
        username: 'carla',
        email: 'carla@rentit.test',
        passwordHash: 'hash',
        phone: '6'.repeat(21),
        zone: 'Gràcia',
        vehicle: 'bike',
        days: ['monday'],
        slots: ['morning'],
      }),
    ).rejects.toThrow();

    expect(await prisma.user.count()).toBe(0);
  });

  it('does not require a session', async () => {
    const response = await request(app)
      .post('/api/riders')
      .set('Authorization', 'Bearer token-falso')
      .send(validBody);

    expect(response.status).toBe(201);
  });
});
