// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import {
  createReservation,
  todayInSpain,
} from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestUser, TEST_PASSWORD } from '../helpers/users.js';

// Modo y hora de entrega al solicitar (US-05.01, #281), POST /api/reservas y cómo se ve después.

function daysFromToday(days: number): string {
  const date = new Date(`${todayInSpain()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// Ana publica un objeto de Gràcia con los tres modos; Bruno es el arrendatario.
async function setUp(itemOverrides: Parameters<typeof createTestItem>[1] = {}) {
  const ana = await createTestUser();
  const bruno = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(ana.id, {
    neighborhood: 'Gràcia',
    address: 'Carrer de Verdi, 45, 2º 1ª',
    homeDelivery: true,
    riderDelivery: true,
    pickupPointDelivery: true,
    ...itemOverrides,
  });
  return {
    ana,
    bruno,
    item,
    anaToken: await loginAs('ana@rentit.test'),
    brunoToken: await loginAs('bruno@rentit.test'),
  };
}

function post(token: string, body: object) {
  return request(app)
    .post('/api/reservas')
    .set('Authorization', `Bearer ${token}`)
    .send({
      startDate: daysFromToday(10),
      endDate: daysFromToday(12),
      ...body,
    });
}

const RIDER = {
  deliveryMode: 'rider',
  slot: '11:00-13:00',
  deliveryAddress: '  Carrer de Pallars, 120  ',
  deliveryNeighborhood: 'Poblenou',
};

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/reservas con modo de entrega', () => {
  it('home: stores the mode and an empty delivery in the same request', async () => {
    const { item, brunoToken } = await setUp();

    const response = await post(brunoToken, {
      itemId: item.id,
      deliveryMode: 'home',
    });

    expect(response.status).toBe(201);
    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: response.body.id },
      include: { delivery: true },
    });
    expect(saved.deliveryMode).toBe('home');
    expect(saved.delivery).toMatchObject({
      pickupPointId: null,
      slot: null,
      deliveryAddress: null,
      fee: null,
    });
  });

  it('rider: stores the slot, the destination and the fee computed by the server', async () => {
    const { item, brunoToken } = await setUp();

    const response = await post(brunoToken, {
      itemId: item.id,
      ...RIDER,
      fee: '0.01',
    });

    expect(response.status).toBe(201);
    expect(response.body.delivery).toEqual({
      mode: 'rider',
      slot: '11:00-13:00',
      pickupPoint: null,
      fee: '5.00',
      deliveryNeighborhood: 'Poblenou',
      deliveryAddress: 'Carrer de Pallars, 120',
      ownerAddress: null,
    });
    const saved = await prisma.delivery.findFirstOrThrow();
    expect(saved.slot).toBe('11:00-13:00');
    expect(saved.fee?.toFixed(2)).toBe('5.00');
    expect(saved.deliveryAddress).toBe('Carrer de Pallars, 120');
  });

  it('rider: the fee is not part of the rental price', async () => {
    const { item, brunoToken } = await setUp();

    const response = await post(brunoToken, { itemId: item.id, ...RIDER });

    // 3 días a 5,00 € (valor por defecto de createTestItem).
    expect(response.body.totalPrice).toBe('15.00');
  });

  it('rider: «asap» is stored as NULL and returned as «asap»', async () => {
    const { item, brunoToken } = await setUp();

    const response = await post(brunoToken, {
      itemId: item.id,
      ...RIDER,
      slot: 'asap',
    });

    expect(response.status).toBe(201);
    expect(response.body.delivery.slot).toBe('asap');
    expect((await prisma.delivery.findFirstOrThrow()).slot).toBeNull();
  });

  it('pickup_point: stores the point and returns its public data', async () => {
    const { item, brunoToken } = await setUp();
    const point = await prisma.pickupPoint.findFirstOrThrow({
      where: { neighborhood: 'Poblenou' },
    });

    const response = await post(brunoToken, {
      itemId: item.id,
      deliveryMode: 'pickup_point',
      pickupPointId: point.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.delivery).toEqual({
      mode: 'pickup_point',
      slot: null,
      pickupPoint: {
        id: point.id,
        name: point.name,
        address: point.address,
        neighborhood: 'Poblenou',
      },
      fee: null,
      deliveryNeighborhood: null,
      deliveryAddress: null,
      ownerAddress: null,
    });
  });

  it('never returns the owner address in the created reservation', async () => {
    const { item, brunoToken } = await setUp();

    const response = await post(brunoToken, {
      itemId: item.id,
      deliveryMode: 'home',
    });

    expect(JSON.stringify(response.body)).not.toContain('Verdi');
  });

  it.each([undefined, '', 'drone', 42])(
    'returns 400 when deliveryMode is %j',
    async (deliveryMode) => {
      const { item, brunoToken } = await setUp();

      const response = await post(brunoToken, {
        itemId: item.id,
        deliveryMode,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Elige un modo de entrega.',
        field: 'deliveryMode',
      });
      expect(await prisma.reservation.count()).toBe(0);
    },
  );

  it.each([
    ['home', { homeDelivery: false }],
    ['rider', { riderDelivery: false }],
    ['pickup_point', { pickupPointDelivery: false }],
  ])(
    'returns 400 when the item does not offer %s',
    async (deliveryMode, overrides) => {
      const { item, brunoToken } = await setUp(overrides);
      const point = await prisma.pickupPoint.findFirstOrThrow();

      const response = await post(brunoToken, {
        itemId: item.id,
        ...RIDER,
        pickupPointId: point.id,
        deliveryMode,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Este objeto no ofrece ese modo de entrega.',
        field: 'deliveryMode',
      });
      expect(await prisma.reservation.count()).toBe(0);
      expect(await prisma.delivery.count()).toBe(0);
    },
  );

  it.each([
    ['slot', { slot: undefined }, 'Elige una hora de entrega.'],
    ['slot', { slot: 'por la tarde' }, 'Elige una hora de entrega.'],
    ['slot', { slot: '10:00-12:00' }, 'Elige una hora de entrega.'],
    ['slot', { slot: 5 }, 'Elige una hora de entrega.'],
    [
      'deliveryAddress',
      { deliveryAddress: undefined },
      'El campo "dirección de entrega" no es correcto, revísalo.',
    ],
    [
      'deliveryAddress',
      { deliveryAddress: '   ' },
      'El campo "dirección de entrega" no es correcto, revísalo.',
    ],
    [
      'deliveryAddress',
      { deliveryAddress: 'x'.repeat(201) },
      'El campo "dirección de entrega" no es correcto, revísalo.',
    ],
    [
      'deliveryNeighborhood',
      { deliveryNeighborhood: undefined },
      'El campo "barrio de entrega" no es correcto, revísalo.',
    ],
    [
      'deliveryNeighborhood',
      { deliveryNeighborhood: 'Madrid' },
      'El campo "barrio de entrega" no es correcto, revísalo.',
    ],
  ])(
    'returns 400 for the rider field %s (%j)',
    async (field, overrides, error) => {
      const { item, brunoToken } = await setUp();

      const response = await post(brunoToken, {
        itemId: item.id,
        ...RIDER,
        ...overrides,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error, field });
      expect(await prisma.reservation.count()).toBe(0);
    },
  );

  it.each([undefined, 'no-es-un-uuid', '00000000-0000-4000-8000-000000000000'])(
    'returns 400 when pickupPointId is %j',
    async (pickupPointId) => {
      const { item, brunoToken } = await setUp();

      const response = await post(brunoToken, {
        itemId: item.id,
        deliveryMode: 'pickup_point',
        pickupPointId,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Elige un punto de recogida.',
        field: 'pickupPointId',
      });
      expect(await prisma.reservation.count()).toBe(0);
    },
  );

  // Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
  it.each(['home', 'rider'])(
    'returns 400 for mode %s when the item offers it but has no address (legacy item)',
    async (mode) => {
      const { item, brunoToken } = await setUp({ address: null });

      const response = await post(brunoToken, {
        itemId: item.id,
        ...RIDER,
        deliveryMode: mode,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Este objeto no ofrece ese modo de entrega.',
        field: 'deliveryMode',
      });
      expect(await prisma.reservation.count()).toBe(0);
    },
  );

  it('still accepts the pickup point for an item without address', async () => {
    const { item, brunoToken } = await setUp({ address: null });
    const point = await prisma.pickupPoint.findFirstOrThrow();

    const response = await post(brunoToken, {
      itemId: item.id,
      deliveryMode: 'pickup_point',
      pickupPointId: point.id,
    });

    expect(response.status).toBe(201);
  });

  it('does not create the delivery when the dates are taken', async () => {
    const { item, bruno, brunoToken } = await setUp();
    const carla = await createTestUser({
      username: 'carla',
      email: 'carla@rentit.test',
    });
    const reservation = await prisma.reservation.create({
      data: {
        itemId: item.id,
        renterId: carla.id,
        startDate: new Date(`${daysFromToday(10)}T00:00:00.000Z`),
        endDate: new Date(`${daysFromToday(12)}T00:00:00.000Z`),
        totalPrice: 15,
        status: 'accepted',
      },
    });

    const response = await post(brunoToken, { itemId: item.id, ...RIDER });

    expect(response.status).toBe(409);
    expect(
      await prisma.reservation.count({ where: { renterId: bruno.id } }),
    ).toBe(0);
    expect(await prisma.delivery.count()).toBe(0);
    expect(reservation.id).toBeDefined();
  });
});

describe('createReservation (service): slots of today', () => {
  it('rejects a slot that has already started when the rental starts today', async () => {
    const { item, bruno } = await setUp();
    const today = todayInSpain();
    // 12:30 UTC son las 13:30 o las 14:30 en España: la franja de las 9:00 ya ha empezado.
    const now = new Date(`${today}T12:30:00.000Z`);
    const base = {
      itemId: item.id,
      startDate: todayInSpain(now),
      endDate: todayInSpain(now),
    };
    const rider = {
      mode: 'rider' as const,
      address: 'Carrer de Pallars, 120',
      neighborhood: 'Poblenou',
    };

    await expect(
      createReservation(
        bruno.id,
        { ...base, delivery: { ...rider, slot: '09:00-11:00' } },
        now,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Elige una hora de entrega.',
      field: 'slot',
    });

    // «Lo antes posible» y las franjas futuras siguen valiendo.
    const asap = await createReservation(
      bruno.id,
      { ...base, delivery: { ...rider, slot: 'asap' } },
      now,
    );
    expect(asap.delivery?.slot).toBe('asap');
  });
});

describe('quién ve qué dirección', () => {
  it('shows the renter the delivery address, and the owner only the neighborhood', async () => {
    const { item, brunoToken, anaToken } = await setUp();
    await post(brunoToken, { itemId: item.id, ...RIDER });

    const renterView = await request(app)
      .get('/api/usuarios/me/reservas')
      .set('Authorization', `Bearer ${brunoToken}`);
    const ownerView = await request(app)
      .get('/api/usuarios/me/reservas')
      .set('Authorization', `Bearer ${anaToken}`);

    expect(renterView.body.sent[0].delivery.deliveryAddress).toBe(
      'Carrer de Pallars, 120',
    );
    expect(ownerView.body.received[0].delivery).toMatchObject({
      mode: 'rider',
      slot: '11:00-13:00',
      fee: '5.00',
      deliveryNeighborhood: 'Poblenou',
      deliveryAddress: null,
    });
    expect(JSON.stringify(ownerView.body)).not.toContain('Pallars');
  });

  it('gives the renter the owner address for a home pickup only once accepted', async () => {
    const { item, brunoToken, anaToken } = await setUp();
    const created = await post(brunoToken, {
      itemId: item.id,
      deliveryMode: 'home',
    });
    const mine = () =>
      request(app)
        .get('/api/usuarios/me/reservas')
        .set('Authorization', `Bearer ${brunoToken}`);

    expect((await mine()).body.sent[0].delivery.ownerAddress).toBeNull();

    const accepted = await request(app)
      .post(`/api/reservas/${created.body.id}/aceptar`)
      .set('Authorization', `Bearer ${anaToken}`);

    expect(accepted.status).toBe(200);
    // La respuesta de aceptar la ve el propietario: no lleva su dirección ni la de entrega.
    expect(accepted.body.delivery.ownerAddress).toBeNull();
    expect((await mine()).body.sent[0].delivery.ownerAddress).toBe(
      'Carrer de Verdi, 45, 2º 1ª',
    );
  });
});
