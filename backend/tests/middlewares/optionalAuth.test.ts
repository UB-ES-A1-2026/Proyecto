import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { optionalAuth } from '../../src/middlewares/optionalAuth.js';
import {
  createSession,
  revokeSession,
} from '../../src/services/sessionService.js';
import { resetDb } from '../helpers/db.js';
import { createTestUser } from '../helpers/users.js';

// App mínima que devuelve lo que optionalAuth deja en req.auth.
const app = express();
app.get('/eco', optionalAuth, (request, response) => {
  response.json({ auth: request.auth ?? null });
});

beforeEach(async () => {
  await resetDb();
});

describe('optionalAuth (#119)', () => {
  it('sets req.auth for an active session', async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);

    const response = await request(app)
      .get('/eco')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.auth).toMatchObject({ userId: user.id });
  });

  it.each([
    ['without an Authorization header', undefined],
    ['with a false token', 'Bearer token-falso'],
    ['with another scheme', 'Basic abc'],
  ])('continues without a session %s', async (_case, authorization) => {
    const call = request(app).get('/eco');
    const response = await (authorization
      ? call.set('Authorization', authorization)
      : call);

    expect(response.status).toBe(200);
    expect(response.body.auth).toBeNull();
  });

  it('continues without a session when the session was revoked', async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);
    const valid = await request(app)
      .get('/eco')
      .set('Authorization', `Bearer ${token}`);
    expect(valid.body.auth).not.toBeNull();
    await revokeSession(valid.body.auth.sessionId);

    const response = await request(app)
      .get('/eco')
      .set('Authorization', `Bearer ${token}`);

    expect(response.body.auth).toBeNull();
  });
});
