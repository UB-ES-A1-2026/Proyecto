// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 02/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem, getTestCategory } from '../helpers/items.js';
import { createTestUser } from '../helpers/users.js';

beforeEach(async () => {
  await resetDb();
});

function search(query: Record<string, string>) {
  return request(app).get('/api/objetos').query(query);
}

function titles(response: request.Response): string[] {
  return response.body.items
    .map((item: { title: string }) => item.title)
    .sort();
}

describe('GET /api/objetos con filtros (US-03.02, #117)', () => {
  it('filters by category', async () => {
    const ana = await createTestUser();
    const sport = await getTestCategory('Deporte');
    await createTestItem(ana.id, { title: 'Taladro' });
    await createTestItem(ana.id, { title: 'Bicicleta', categoryId: sport.id });

    const response = await search({ categoryId: sport.id });

    expect(response.status).toBe(200);
    expect(titles(response)).toEqual(['Bicicleta']);
    expect(response.body.total).toBe(1);
  });

  it('filters by maximum daily price, including the limit itself', async () => {
    const ana = await createTestUser();
    await createTestItem(ana.id, { title: 'Barato', dailyPrice: 5 });
    await createTestItem(ana.id, { title: 'Justo', dailyPrice: 10 });
    await createTestItem(ana.id, { title: 'Caro', dailyPrice: 10.01 });

    const response = await search({ maxPrice: '10' });

    expect(response.status).toBe(200);
    expect(titles(response)).toEqual(['Barato', 'Justo']);
  });

  it('accepts decimals in the maximum price', async () => {
    const ana = await createTestUser();
    await createTestItem(ana.id, { title: 'Justo', dailyPrice: 7.5 });
    await createTestItem(ana.id, { title: 'Caro', dailyPrice: 7.51 });

    const response = await search({ maxPrice: '7.50' });

    expect(titles(response)).toEqual(['Justo']);
  });

  it('filters by neighborhood text, ignoring case', async () => {
    const ana = await createTestUser();
    await createTestItem(ana.id, {
      title: 'En Gràcia',
      neighborhood: 'Vila de Gràcia',
    });
    await createTestItem(ana.id, { title: 'En Sants', neighborhood: 'Sants' });

    const response = await search({ neighborhood: 'gràcia' });

    expect(titles(response)).toEqual(['En Gràcia']);
  });

  it('combines text and every filter with AND (criterios 3 y 4)', async () => {
    const ana = await createTestUser();
    const tools = await getTestCategory();
    const sport = await getTestCategory('Deporte');
    const base = {
      categoryId: tools.id,
      dailyPrice: 5,
      neighborhood: 'Gràcia',
    };
    await createTestItem(ana.id, { ...base, title: 'Taladro bueno' });
    await createTestItem(ana.id, {
      ...base,
      title: 'Taladro caro',
      dailyPrice: 20,
    });
    await createTestItem(ana.id, {
      ...base,
      title: 'Taladro en Sants',
      neighborhood: 'Sants',
    });
    await createTestItem(ana.id, {
      ...base,
      title: 'Taladro deportivo',
      categoryId: sport.id,
    });
    await createTestItem(ana.id, { ...base, title: 'Escalera' });

    const response = await search({
      q: 'taladro bueno',
      categoryId: tools.id,
      maxPrice: '10',
      neighborhood: 'gràcia',
    });

    expect(titles(response)).toEqual(['Taladro bueno']);
  });

  it('still hides paused and withdrawn items when filtering', async () => {
    const ana = await createTestUser();
    await createTestItem(ana.id, { title: 'Publicado' });
    await createTestItem(ana.id, { title: 'Pausado', status: 'paused' });
    await createTestItem(ana.id, { title: 'Retirado', status: 'withdrawn' });

    const response = await search({ maxPrice: '100' });

    expect(titles(response)).toEqual(['Publicado']);
  });

  it('returns an empty page when no item matches the filters', async () => {
    const ana = await createTestUser();
    await createTestItem(ana.id, { dailyPrice: 50 });

    const response = await search({ maxPrice: '2' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], total: 0, page: 1 });
  });

  it('ignores empty filters, so «Limpiar filtros» returns everything (criterio 5)', async () => {
    const ana = await createTestUser();
    await createTestItem(ana.id, { title: 'Uno' });
    await createTestItem(ana.id, { title: 'Dos' });

    const response = await search({
      categoryId: '',
      maxPrice: '',
      neighborhood: '  ',
    });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
  });

  it('returns no items for a valid UUID that is not a category', async () => {
    const ana = await createTestUser();
    await createTestItem(ana.id);

    const response = await search({
      categoryId: '00000000-0000-4000-8000-000000000000',
    });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
  });

  it.each([
    ['categoryId', 'no-es-un-uuid', 'categoría'],
    ['maxPrice', '0', 'precio máximo'],
    ['maxPrice', '-5', 'precio máximo'],
    ['maxPrice', 'diez', 'precio máximo'],
    ['maxPrice', '10,50', 'precio máximo'],
    ['maxPrice', '1.234', 'precio máximo'],
    ['maxPrice', '123456789', 'precio máximo'],
    ['neighborhood', 'a'.repeat(101), 'barrio'],
  ])('rejects %s=%s with 400 and the field', async (field, value, label) => {
    const response = await search({ [field]: value });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: `El campo "${label}" no es correcto, revísalo.`,
      field,
    });
  });
});
