// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
// Trabajos del rider (US-10.01, #292): un test por cada caso del contrato.
import type { DeliveryMode, DeliveryStatus } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/repositories/prisma.js';
import { publish } from '../../src/services/realtimeService.js';
import { todayInSpain } from '../../src/services/reservationService.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import {
  createTestRider,
  createTestUser,
  TEST_PASSWORD,
} from '../helpers/users.js';

// El canal en tiempo real de verdad, pero espiado: así se comprueba a quién avisa al aceptar.
vi.mock('../../src/services/realtimeService.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/services/realtimeService.js')
    >();
  return { ...actual, publish: vi.fn(actual.publish) };
});

const FORBIDDEN_MESSAGE = 'Solo los riders aceptados pueden ver los trabajos.';
const TAKEN_MESSAGE = 'Ya asignado a otro rider.';
const DAY_MS = 24 * 60 * 60 * 1000;

// «AAAA-MM-DD» a `offset` días de hoy en España, como compara el servidor.
function day(offset: number): string {
  const today = new Date(`${todayInSpain()}T00:00:00.000Z`);
  return new Date(today.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

beforeEach(async () => {
  await resetDb();
  vi.mocked(publish).mockClear();
});

async function loginAs(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  return response.body.token as string;
}

// ana es la propietaria (objeto en Gràcia), bruno el arrendatario, y rita y roger son riders
// aceptados.
async function setUp() {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const rita = await createTestRider('approved', {
    username: 'rita',
    email: 'rita@rentit.test',
  });
  const roger = await createTestRider('approved', {
    username: 'roger',
    email: 'roger@rentit.test',
  });
  const item = await createTestItem(owner.id, {
    title: 'Taladro percutor Bosch',
    neighborhood: 'Gràcia',
    address: 'Carrer de Verdi, 12, 2.º 1.ª',
    homeDelivery: true,
    riderDelivery: true,
  });

  return {
    owner,
    renter,
    rita,
    roger,
    item,
    ritaToken: await loginAs('rita@rentit.test'),
    rogerToken: await loginAs('roger@rentit.test'),
  };
}

// Una reserva con su entrega. Por defecto, un trabajo disponible: pagada, por rider y sin rider.
async function createJob(
  itemId: string,
  renterId: string,
  options: Partial<{
    startDate: string;
    slot: string | null;
    status: 'pending' | 'accepted' | 'cancelled' | 'paid' | 'in_progress';
    mode: DeliveryMode;
    riderId: string;
    deliveryStatus: DeliveryStatus;
  }> = {},
) {
  const startDate = options.startDate ?? day(3);
  const mode = options.mode ?? 'rider';
  const reservation = await createTestReservation(itemId, renterId, {
    startDate,
    endDate: startDate,
    status: options.status ?? 'paid',
  });
  const withRider = mode === 'rider';
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      deliveryMode: mode,
      delivery: {
        create: withRider
          ? {
              slot: options.slot === undefined ? '09:00-11:00' : options.slot,
              deliveryAddress: 'Carrer de Mallorca, 120, 3.º',
              deliveryNeighborhood: 'Eixample',
              fee: '5.00',
              deliveryCode: '048213',
              riderId: options.riderId ?? null,
              status:
                options.deliveryStatus ??
                (options.riderId ? 'assigned' : 'pending'),
              assignedAt: options.riderId ? new Date() : null,
              // La BD exige la hora de «Entregada» (CHECK de US-05.02).
              deliveredAt:
                options.deliveryStatus === 'delivered' ? new Date() : null,
            }
          : {},
      },
    },
  });
  return reservation;
}

function get(path: string, token?: string) {
  const call = request(app).get(`/api${path}`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

function accept(id: string, token?: string) {
  const call = request(app).post(`/api/trabajos/${id}/aceptar`);
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
}

describe('acceso a /api/trabajos', () => {
  it('responde 401 sin sesión en los tres endpoints', async () => {
    const { item, renter } = await setUp();
    const job = await createJob(item.id, renter.id);

    expect((await get('/trabajos')).status).toBe(401);
    expect((await get('/trabajos/mios')).status).toBe(401);
    expect((await accept(job.id)).status).toBe(401);
  });

  it('responde 403 a una cuenta normal y a los riders pendientes o rechazados', async () => {
    const { item, renter } = await setUp();
    const job = await createJob(item.id, renter.id);
    await createTestRider('pending', {
      username: 'pere',
      email: 'pere@rentit.test',
    });
    await createTestRider('rejected', {
      username: 'rosa',
      email: 'rosa@rentit.test',
    });

    for (const email of [
      'bruno@rentit.test',
      'pere@rentit.test',
      'rosa@rentit.test',
    ]) {
      const token = await loginAs(email);
      for (const response of [
        await get('/trabajos', token),
        await get('/trabajos/mios', token),
        await accept(job.id, token),
      ]) {
        expect(response.status, email).toBe(403);
        expect(response.body, email).toEqual({ error: FORBIDDEN_MESSAGE });
      }
    }
    // Nadie se lo ha quedado.
    expect(
      (await prisma.delivery.findFirstOrThrow({ where: {} })).riderId,
    ).toBeNull();
  });
});

describe('GET /api/trabajos', () => {
  it('lista el trabajo con barrios y sin direcciones', async () => {
    const { item, renter, ritaToken } = await setUp();
    const job = await createJob(item.id, renter.id, {
      startDate: day(2),
      slot: '09:00-11:00',
    });

    const response = await get('/trabajos', ritaToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      jobs: [
        {
          id: job.id,
          item: { id: item.id, title: 'Taladro percutor Bosch' },
          startDate: day(2),
          slot: '09:00-11:00',
          fee: '5.00',
          pickupNeighborhood: 'Gràcia',
          deliveryNeighborhood: 'Eixample',
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain('Verdi');
    expect(JSON.stringify(response.body)).not.toContain('Mallorca');
  });

  it('ordena por fecha de inicio y, el mismo día, «Lo antes posible» primero y luego por franja', async () => {
    const { item, renter, ritaToken } = await setUp();
    const late = await createJob(item.id, renter.id, {
      startDate: day(2),
      slot: '17:00-19:00',
    });
    const asap = await createJob(item.id, renter.id, {
      startDate: day(2),
      slot: null,
    });
    const tomorrow = await createJob(item.id, renter.id, {
      startDate: day(1),
      slot: '19:00-21:00',
    });
    const early = await createJob(item.id, renter.id, {
      startDate: day(2),
      slot: '09:00-11:00',
    });
    const today = await createJob(item.id, renter.id, {
      startDate: day(0),
      slot: '21:00-23:00',
    });

    const response = await get('/trabajos', ritaToken);

    expect(response.status).toBe(200);
    expect(response.body.jobs.map(({ id }: { id: string }) => id)).toEqual([
      today.id,
      tomorrow.id,
      asap.id,
      early.id,
      late.id,
    ]);
    expect(response.body.jobs[2].slot).toBe('asap');
  });

  it('no lista los asignados, sin pagar, sin rider, pasados, cancelados ni los propios del rider', async () => {
    const { owner, item, renter, rita, roger, ritaToken } = await setUp();
    const available = await createJob(item.id, renter.id);
    await createJob(item.id, renter.id, { riderId: roger.id });
    await createJob(item.id, renter.id, { status: 'pending' });
    await createJob(item.id, renter.id, { status: 'accepted' });
    await createJob(item.id, renter.id, { status: 'cancelled' });
    await createJob(item.id, renter.id, { mode: 'home' });
    await createJob(item.id, renter.id, { startDate: day(-1) });
    // Un objeto del propio rider y una reserva suya (en la BD, aunque la API no lo deje hacer).
    const ownItem = await createTestItem(rita.id, {
      title: 'Bici de rita',
      riderDelivery: true,
    });
    await createJob(ownItem.id, renter.id);
    await createJob(item.id, rita.id);
    expect(owner.id).not.toBe(rita.id);

    const response = await get('/trabajos', ritaToken);

    expect(response.status).toBe(200);
    expect(response.body.jobs.map(({ id }: { id: string }) => id)).toEqual([
      available.id,
    ]);
  });

  it('responde una lista vacía si no hay trabajos', async () => {
    const { ritaToken } = await setUp();

    const response = await get('/trabajos', ritaToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ jobs: [] });
  });
});

describe('POST /api/trabajos/:id/aceptar', () => {
  it('asigna el trabajo al rider y lo devuelve con las direcciones', async () => {
    const { owner, renter, item, rita, ritaToken } = await setUp();
    const job = await createJob(item.id, renter.id, {
      startDate: day(2),
      slot: null,
    });
    const before = Date.now();

    const response = await accept(job.id, ritaToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      job: {
        id: job.id,
        item: { id: item.id, title: 'Taladro percutor Bosch' },
        startDate: day(2),
        slot: 'asap',
        fee: '5.00',
        pickupNeighborhood: 'Gràcia',
        pickupAddress: 'Carrer de Verdi, 12, 2.º 1.ª',
        deliveryNeighborhood: 'Eixample',
        deliveryAddress: 'Carrer de Mallorca, 120, 3.º',
        status: 'assigned',
      },
    });
    const delivery = await prisma.delivery.findUniqueOrThrow({
      where: { reservationId: job.id },
    });
    expect(delivery.riderId).toBe(rita.id);
    expect(delivery.status).toBe('assigned');
    expect(delivery.assignedAt?.getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
    // Avisa a las dos personas de la reserva y al rider (como el seguimiento, US-05.02).
    expect(publish).toHaveBeenCalledWith(
      expect.arrayContaining([renter.id, owner.id, rita.id]),
      'entrega.estado',
      expect.objectContaining({ reservationId: job.id, status: 'assigned' }),
    );
  });

  it('el trabajo aceptado desaparece de la lista de los demás riders', async () => {
    const { renter, item, ritaToken, rogerToken } = await setUp();
    const job = await createJob(item.id, renter.id);
    const other = await createJob(item.id, renter.id, { startDate: day(4) });

    await accept(job.id, ritaToken);

    const response = await get('/trabajos', rogerToken);
    expect(response.body.jobs.map(({ id }: { id: string }) => id)).toEqual([
      other.id,
    ]);
  });

  it('responde 409 al segundo rider que lo acepta', async () => {
    const { renter, item, rita, ritaToken, rogerToken } = await setUp();
    const job = await createJob(item.id, renter.id);

    expect((await accept(job.id, ritaToken)).status).toBe(200);
    const response = await accept(job.id, rogerToken);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: TAKEN_MESSAGE });
    expect(
      (
        await prisma.delivery.findUniqueOrThrow({
          where: { reservationId: job.id },
        })
      ).riderId,
    ).toBe(rita.id);
  });

  it('si dos riders aceptan a la vez, solo uno lo consigue', async () => {
    const { renter, item, rita, roger, ritaToken, rogerToken } = await setUp();
    const job = await createJob(item.id, renter.id);

    const responses = await Promise.all([
      accept(job.id, ritaToken),
      accept(job.id, rogerToken),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const winner = responses[0].status === 200 ? rita.id : roger.id;
    const delivery = await prisma.delivery.findUniqueOrThrow({
      where: { reservationId: job.id },
    });
    expect(delivery.riderId).toBe(winner);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('aceptar otra vez un trabajo propio no falla ni cambia la hora', async () => {
    const { renter, item, ritaToken } = await setUp();
    const job = await createJob(item.id, renter.id);
    await accept(job.id, ritaToken);
    const { assignedAt } = await prisma.delivery.findUniqueOrThrow({
      where: { reservationId: job.id },
    });

    const response = await accept(job.id, ritaToken);

    expect(response.status).toBe(200);
    expect(response.body.job.status).toBe('assigned');
    expect(
      (
        await prisma.delivery.findUniqueOrThrow({
          where: { reservationId: job.id },
        })
      ).assignedAt,
    ).toEqual(assignedAt);
  });

  it('responde 409 si el trabajo ya no está disponible: cancelado o ya empezado', async () => {
    const { renter, item, ritaToken } = await setUp();
    const cancelled = await createJob(item.id, renter.id, {
      status: 'cancelled',
    });
    const started = await createJob(item.id, renter.id, {
      startDate: day(-1),
    });

    for (const job of [cancelled, started]) {
      const response = await accept(job.id, ritaToken);
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: TAKEN_MESSAGE });
    }
    expect(
      await prisma.delivery.count({ where: { riderId: { not: null } } }),
    ).toBe(0);
  });

  it('responde 404 si la reserva no existe, el id no es válido o no es un trabajo de rider', async () => {
    const { renter, item, rita, ritaToken } = await setUp();
    const home = await createJob(item.id, renter.id, { mode: 'home' });
    const unpaid = await createJob(item.id, renter.id, { status: 'pending' });
    const ownItem = await createTestItem(rita.id, {
      title: 'Bici de rita',
      riderDelivery: true,
    });
    const ownAsOwner = await createJob(ownItem.id, renter.id);
    const ownAsRenter = await createJob(item.id, rita.id);

    for (const id of [
      '6c1b7f0e-9a8d-4b6c-8f5e-2d3a4b5c6d7e',
      'no-es-un-uuid',
      home.id,
      unpaid.id,
      ownAsOwner.id,
      ownAsRenter.id,
    ]) {
      const response = await accept(id, ritaToken);
      expect(response.status, id).toBe(404);
      expect(response.body.error, id).toBeTruthy();
    }
    expect(
      await prisma.delivery.count({ where: { riderId: { not: null } } }),
    ).toBe(0);
  });

  it('si falla el aviso en tiempo real, el trabajo se acepta igualmente', async () => {
    const { renter, item, ritaToken } = await setUp();
    const job = await createJob(item.id, renter.id);
    vi.mocked(publish).mockImplementationOnce(() => {
      throw new Error('bus caído');
    });

    const response = await accept(job.id, ritaToken);

    expect(response.status).toBe(200);
    expect(response.body.job.status).toBe('assigned');
  });
});

describe('GET /api/trabajos/mios', () => {
  it('lista los trabajos del rider por fecha de inicio, con direcciones y estado', async () => {
    const { renter, item, rita, roger, ritaToken } = await setUp();
    const later = await createJob(item.id, renter.id, {
      startDate: day(5),
      riderId: rita.id,
    });
    const sooner = await createJob(item.id, renter.id, {
      startDate: day(1),
      slot: null,
      riderId: rita.id,
      status: 'in_progress',
      deliveryStatus: 'delivered',
    });
    await createJob(item.id, renter.id, { riderId: roger.id });
    await createJob(item.id, renter.id);

    const response = await get('/trabajos/mios', ritaToken);

    expect(response.status).toBe(200);
    expect(response.body.jobs.map(({ id }: { id: string }) => id)).toEqual([
      sooner.id,
      later.id,
    ]);
    expect(response.body.jobs[0]).toEqual({
      id: sooner.id,
      item: { id: item.id, title: 'Taladro percutor Bosch' },
      startDate: day(1),
      slot: 'asap',
      fee: '5.00',
      pickupNeighborhood: 'Gràcia',
      pickupAddress: 'Carrer de Verdi, 12, 2.º 1.ª',
      deliveryNeighborhood: 'Eixample',
      deliveryAddress: 'Carrer de Mallorca, 120, 3.º',
      status: 'delivered',
    });
    expect(response.body.jobs[1].status).toBe('assigned');
  });

  it('no lista las reservas canceladas', async () => {
    const { renter, item, rita, ritaToken } = await setUp();
    const kept = await createJob(item.id, renter.id, { riderId: rita.id });
    await createJob(item.id, renter.id, {
      riderId: rita.id,
      status: 'cancelled',
    });

    const response = await get('/trabajos/mios', ritaToken);

    expect(response.status).toBe(200);
    expect(response.body.jobs.map(({ id }: { id: string }) => id)).toEqual([
      kept.id,
    ]);
  });

  it('responde una lista vacía si todavía no ha aceptado ninguno', async () => {
    const { ritaToken } = await setUp();

    const response = await get('/trabajos/mios', ritaToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ jobs: [] });
  });
});
