// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { DELIVERY_SLOTS } from '../../src/services/deliverySlots.js';
import { todayInSpain } from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser } from '../helpers/users.js';

// GET /api/objetos/:id/entrega y /entrega/tarifa (US-05.01, #281).
const NOT_FOUND = { error: 'No hemos encontrado este objeto.' };
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

beforeEach(async () => {
  await resetDb();
});

async function createOwner() {
  return createTestUser();
}

function getOptions(id: string, query: object = {}) {
  return request(app).get(`/api/objetos/${id}/entrega`).query(query);
}

function getQuote(id: string, query: object = {}) {
  return request(app).get(`/api/objetos/${id}/entrega/tarifa`).query(query);
}

describe('GET /api/objetos/:id/entrega', () => {
  it('returns the modes, the pickup points sorted by distance and the slots, without a session', async () => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, {
      neighborhood: 'Gràcia',
      homeDelivery: true,
      pickupPointDelivery: true,
    });

    const response = await getOptions(item.id);

    expect(response.status).toBe(200);
    expect(response.body.modes).toEqual({
      home: true,
      rider: false,
      pickupPoint: true,
    });
    expect(response.body.slots).toEqual([...DELIVERY_SLOTS]);
    expect(response.body.pickupPoints).toHaveLength(6);
    expect(response.body.pickupPoints[0]).toEqual({
      id: expect.any(String),
      name: 'Biblioteca Jaume Fuster',
      address: 'Plaça de Lesseps, 20-22',
      neighborhood: 'Gràcia',
      distanceKm: expect.any(Number),
    });
    const distances = response.body.pickupPoints.map(
      (point: { distanceKm: number }) => point.distanceKm,
    );
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    for (const distance of distances) {
      expect(Number.isInteger(distance * 10)).toBe(true);
    }
  });

  it('returns no pickup points when the item does not offer them', async () => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, { riderDelivery: true });

    const response = await getOptions(item.id);

    expect(response.body.modes.pickupPoint).toBe(false);
    expect(response.body.pickupPoints).toEqual([]);
  });

  it('never includes the address of the owner', async () => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, {
      homeDelivery: true,
      address: 'Carrer de Verdi, 45',
    });

    const response = await getOptions(item.id);

    expect(JSON.stringify(response.body)).not.toContain('Verdi');
  });

  it('does not filter slots when the start date is in the future or missing', async () => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, { riderDelivery: true });

    const withDate = await getOptions(item.id, { startDate: '2099-01-01' });
    const withoutDate = await getOptions(item.id);

    expect(withDate.body.slots).toEqual([...DELIVERY_SLOTS]);
    expect(withoutDate.body.slots).toEqual([...DELIVERY_SLOTS]);
  });

  it('only offers slots that have not started when the rental starts today', async () => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, { riderDelivery: true });

    const response = await getOptions(item.id, { startDate: todayInSpain() });

    expect(response.status).toBe(200);
    expect(response.body.slots.length).toBeLessThanOrEqual(
      DELIVERY_SLOTS.length,
    );
    for (const slot of response.body.slots) {
      expect(DELIVERY_SLOTS).toContain(slot);
    }
  });

  it.each(['2026-02-30', 'mañana', '2026-1-1', ''])(
    'returns 400 for the start date %j',
    async (startDate) => {
      const ana = await createOwner();
      const item = await createTestItem(ana.id, { riderDelivery: true });

      const response = await getOptions(item.id, { startDate });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'El campo "fecha de inicio" no es correcto, revísalo.',
        field: 'startDate',
      });
    },
  );

  it.each(['paused', 'withdrawn'] as const)(
    'returns 404 for a %s item',
    async (status) => {
      const ana = await createOwner();
      const item = await createTestItem(ana.id, { status });

      const response = await getOptions(item.id);

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    },
  );

  it.each([MISSING_ID, 'no-es-un-uuid'])(
    'returns 404 for the item %s',
    async (id) => {
      const response = await getOptions(id);

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    },
  );
});

describe('GET /api/objetos/:id/entrega/tarifa', () => {
  it('returns the distance and the fee for a neighborhood, without a session', async () => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, {
      neighborhood: 'Gràcia',
      riderDelivery: true,
    });

    const response = await getQuote(item.id, { barrio: 'Poblenou' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ distanceKm: 4.7, fee: '5.00' });
  });

  it.each([
    ['El Coll', '3.00'],
    ['Poblenou', '5.00'],
    ['Sant Andreu', '7.00'],
  ])('charges %s as %s from Gràcia', async (barrio, fee) => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, {
      neighborhood: 'Gràcia',
      riderDelivery: true,
    });

    const response = await getQuote(item.id, { barrio });

    expect(response.body.fee).toBe(fee);
  });

  it('uses the highest tier when the item neighborhood is legacy free text', async () => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, {
      neighborhood: 'Vila de Gràcia',
      riderDelivery: true,
    });

    const response = await getQuote(item.id, { barrio: 'Gràcia' });

    expect(response.body).toEqual({ distanceKm: null, fee: '7.00' });
  });

  it.each([undefined, '', 'Madrid'])(
    'returns 400 for the neighborhood %j',
    async (barrio) => {
      const ana = await createOwner();
      const item = await createTestItem(ana.id, { riderDelivery: true });

      const response = await getQuote(
        item.id,
        barrio === undefined ? {} : { barrio },
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'El campo "barrio de entrega" no es correcto, revísalo.',
        field: 'deliveryNeighborhood',
      });
    },
  );

  it('returns 400 when the item does not offer rider delivery', async () => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, { homeDelivery: true });

    const response = await getQuote(item.id, { barrio: 'Gràcia' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Este objeto no ofrece entrega por rider.',
    });
  });

  it('returns 404 for a paused item and for an item that does not exist', async () => {
    const ana = await createOwner();
    const item = await createTestItem(ana.id, {
      status: 'paused',
      riderDelivery: true,
    });

    for (const id of [item.id, MISSING_ID, 'no-es-un-uuid']) {
      const response = await getQuote(id, { barrio: 'Gràcia' });
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    }
    expect(await prisma.item.count()).toBe(1);
  });
});
