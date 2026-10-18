import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { errorMiddleware } from '../../src/middlewares/errorMiddleware.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('returns the exact health response', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('returns the not found response', async () => {
    const response = await request(app).get('/api/no-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Ruta no encontrada' });
  });
});

describe('error handling', () => {
  it('returns a generic error without exposing the stack trace', async () => {
    const failingApp = express();
    failingApp.get('/failure', () => {
      throw new Error('private stack trace');
    });
    failingApp.use(errorMiddleware);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(failingApp).get('/failure');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify(response.body)).not.toContain('private stack trace');
  });
});
