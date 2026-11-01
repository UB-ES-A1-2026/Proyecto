import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';

describe('GET /api/categorias (#14, contrato de #117)', () => {
  it('returns the categories created by the migration, sorted by name, without a session', async () => {
    const response = await request(app).get('/api/categorias');

    expect(response.status).toBe(200);
    expect(
      response.body.map((category: { name: string }) => category.name),
    ).toEqual([
      'Camping y viajes',
      'Deporte',
      'Electrónica',
      'Fiestas y eventos',
      'Herramientas y bricolaje',
      'Hogar y jardín',
      'Infantil',
      'Otros',
    ]);
  });

  it('returns only id and name', async () => {
    const response = await request(app).get('/api/categorias');

    for (const category of response.body) {
      expect(Object.keys(category).sort()).toEqual(['id', 'name']);
      expect(category.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
