// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';

describe('GET /api/barrios (US-05.01, #281)', () => {
  it('returns the sorted list of neighborhoods without a session', async () => {
    const response = await request(app).get('/api/barrios');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining(['Gràcia', 'Poblenou']),
    );
    expect(response.body).toEqual(
      [...response.body].sort((a: string, b: string) =>
        new Intl.Collator('es').compare(a, b),
      ),
    );
  });
});
