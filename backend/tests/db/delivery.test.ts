// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/repositories/prisma.js';
import { isKnownNeighborhood } from '../../src/services/neighborhoods.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser } from '../helpers/users.js';

// Tablas punto_recogida y entrega (US-05.01, #281), con las reglas que solo están en la BD.

async function createReservation() {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(owner.id);
  return createTestReservation(item.id, renter.id);
}

beforeEach(async () => {
  await resetDb();
});

describe('punto_recogida', () => {
  it('trae los puntos de la migración, que resetDb() conserva, con barrios de la lista', async () => {
    const points = await prisma.pickupPoint.findMany();

    expect(points.length).toBeGreaterThanOrEqual(6);
    expect(points.map(({ neighborhood }) => neighborhood)).toEqual(
      expect.arrayContaining(['Gràcia', 'Poblenou']),
    );
    for (const point of points) {
      expect(isKnownNeighborhood(point.neighborhood)).toBe(true);
    }
  });
});

describe('objeto.direccion', () => {
  it('es opcional', async () => {
    const owner = await createTestUser();
    const item = await createTestItem(owner.id);

    expect(item.address).toBeNull();
  });
});

describe('entrega', () => {
  it('se crea para una reserva y se relaciona con ella', async () => {
    const reservation = await createReservation();
    const point = await prisma.pickupPoint.findFirstOrThrow();

    const delivery = await prisma.delivery.create({
      data: { reservationId: reservation.id, pickupPointId: point.id },
    });

    expect(delivery.slot).toBeNull();
    expect(delivery.fee).toBeNull();
  });

  it('solo admite una entrega por reserva', async () => {
    const reservation = await createReservation();
    await prisma.delivery.create({ data: { reservationId: reservation.id } });

    await expect(
      prisma.delivery.create({ data: { reservationId: reservation.id } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rechaza una tarifa que no sea positiva', async () => {
    const reservation = await createReservation();

    await expect(
      prisma.delivery.create({
        data: { reservationId: reservation.id, fee: new Prisma.Decimal(0) },
      }),
    ).rejects.toThrow();
  });

  it('rechaza una franja con formato incorrecto', async () => {
    const reservation = await createReservation();

    await expect(
      prisma.delivery.create({
        data: { reservationId: reservation.id, slot: 'por la tarde' },
      }),
    ).rejects.toThrow();
  });

  it('no deja borrar una reserva ni un punto de recogida con entregas', async () => {
    const reservation = await createReservation();
    const point = await prisma.pickupPoint.findFirstOrThrow();
    await prisma.delivery.create({
      data: { reservationId: reservation.id, pickupPointId: point.id },
    });

    await expect(
      prisma.reservation.delete({ where: { id: reservation.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.pickupPoint.delete({ where: { id: point.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
