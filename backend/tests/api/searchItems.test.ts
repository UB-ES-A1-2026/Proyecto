// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { SEARCH_PAGE_SIZE } from '../../src/services/itemSearchService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem, getTestCategory } from '../helpers/items.js';
import { createTestUser } from '../helpers/users.js';

beforeEach(async () => {
  await resetDb();
});

function search(query: Record<string, string> = {}) {
  return request(app).get('/api/objetos').query(query);
}

describe('GET /api/objetos (US-03.01, #114)', () => {
  // Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
  it('never includes the address of the owner (US-05.01, #281)', async () => {
    const ana = await createTestUser();
    await createTestItem(ana.id, {
      homeDelivery: true,
      address: 'Carrer de Verdi, 45, 2º 1ª',
    });

    const response = await search();

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).not.toHaveProperty('address');
    expect(JSON.stringify(response.body)).not.toContain('Carrer de Verdi');
  });

  it('returns the published items whose title or description contain the text (criterio 2)', async () => {
    const ana = await createTestUser();
    // createTestItem pone «Taladro con maletín…» de descripción: se cambia para que solo
    // coincidan por el título o por la descripción los objetos que interesan.
    const createWithDescription = async (
      title: string,
      description: string,
    ) => {
      const item = await createTestItem(ana.id, { title });
      return prisma.item.update({
        where: { id: item.id },
        data: { description },
      });
    };
    const title = await createWithDescription(
      'Taladro percutor',
      'Con maletín.',
    );
    const other = await createWithDescription(
      'Bicicleta de paseo',
      'Incluye un TALADRO de regalo',
    );
    await createWithDescription('Tienda de campaña', 'Para 4 personas.');

    const response = await search({ q: 'taladro' });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(
      response.body.items.map((item: { id: string }) => item.id).sort(),
    ).toEqual([title.id, other.id].sort());
  });

  it('returns each item as a public summary', async () => {
    const ana = await createTestUser();
    const category = await getTestCategory();
    const item = await createTestItem(ana.id, {
      title: 'Taladro percutor',
      dailyPrice: 5,
      neighborhood: 'Gràcia',
    });

    const response = await search({ q: 'taladro' });

    expect(response.body).toEqual({
      items: [
        {
          id: item.id,
          title: 'Taladro percutor',
          dailyPrice: '5.00',
          neighborhood: 'Gràcia',
          category: { id: category.id, name: category.name },
          photo: null,
        },
      ],
      page: 1,
      pageSize: SEARCH_PAGE_SIZE,
      total: 1,
    });
  });

  it('returns an empty list when nothing matches (criterio 4)', async () => {
    const ana = await createTestUser();
    await createTestItem(ana.id);

    const response = await search({ q: 'zzzz' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], total: 0 });
  });

  it('never returns paused or withdrawn items', async () => {
    const ana = await createTestUser();
    const published = await createTestItem(ana.id, { title: 'Taladro 1' });
    await createTestItem(ana.id, { title: 'Taladro 2', status: 'paused' });
    await createTestItem(ana.id, { title: 'Taladro 3', status: 'withdrawn' });

    const response = await search({ q: 'taladro' });

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe(published.id);
  });

  it('without text returns every published item, newest first', async () => {
    const ana = await createTestUser();
    const older = await createTestItem(ana.id, { title: 'Antiguo' });
    await prisma.item.update({
      where: { id: older.id },
      data: { createdAt: new Date('2026-01-01T00:00:00Z') },
    });
    const newer = await createTestItem(ana.id, { title: 'Nuevo' });

    for (const query of [{}, { q: '   ' }]) {
      const response = await search(query);
      expect(
        response.body.items.map((item: { id: string }) => item.id),
      ).toEqual([newer.id, older.id]);
    }
  });

  it('paginates with page and pageSize', async () => {
    const ana = await createTestUser();
    for (let index = 0; index < SEARCH_PAGE_SIZE + 3; index += 1) {
      await createTestItem(ana.id, { title: `Taladro ${index}` });
    }

    const first = await search({ q: 'taladro' });
    const second = await search({ q: 'taladro', page: '2' });

    expect(first.body.items).toHaveLength(SEARCH_PAGE_SIZE);
    expect(second.body).toMatchObject({ page: 2, total: SEARCH_PAGE_SIZE + 3 });
    expect(second.body.items).toHaveLength(3);
    const firstIds = new Set(
      first.body.items.map((item: { id: string }) => item.id),
    );
    for (const item of second.body.items)
      expect(firstIds.has(item.id)).toBe(false);
  });

  it.each(['0', '-1', 'dos', '1.5'])(
    'returns 400 for page=%s',
    async (page) => {
      const response = await search({ page });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'El campo "página" no es correcto, revísalo.',
        field: 'page',
      });
    },
  );

  it('returns 400 for a search text longer than 100 characters', async () => {
    const response = await search({ q: 'a'.repeat(101) });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('q');
  });

  it('does not need a session', async () => {
    const response = await search();

    expect(response.status).toBe(200);
  });
});
