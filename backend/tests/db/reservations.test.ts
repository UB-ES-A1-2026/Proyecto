import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser } from '../helpers/users.js';

// Tabla de reservas del Sprint 1 (#120): comprueba lo que esperan US-04.01 a US-04.04,
// incluidas las reglas que solo están en la BD (CHECK).
// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026

async function createOwnerRenterAndItem() {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(owner.id);

  return { owner, renter, item };
}

beforeEach(async () => {
  await resetDb();
});

describe('reserva', () => {
  it('se crea pendiente y sin modo de entrega', async () => {
    const { renter, item } = await createOwnerRenterAndItem();

    const reservation = await createTestReservation(item.id, renter.id);

    expect(reservation.status).toBe('pending');
    expect(reservation.deliveryMode).toBeNull();
    expect(reservation.totalPrice.toFixed(2)).toBe('15.00');
  });

  it('guarda las fechas sin hora', async () => {
    const { renter, item } = await createOwnerRenterAndItem();

    const { id } = await createTestReservation(item.id, renter.id, {
      startDate: '2026-12-04',
      endDate: '2026-12-06',
    });

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id },
    });
    expect(reservation.startDate.toISOString()).toBe(
      '2026-12-04T00:00:00.000Z',
    );
    expect(reservation.endDate.toISOString()).toBe('2026-12-06T00:00:00.000Z');
  });

  it('acepta una reserva de un solo día', async () => {
    const { renter, item } = await createOwnerRenterAndItem();

    const reservation = await createTestReservation(item.id, renter.id, {
      startDate: '2026-12-04',
      endDate: '2026-12-04',
    });

    expect(reservation.id).toBeDefined();
  });

  it('la BD rechaza una fecha de fin anterior a la de inicio', async () => {
    const { renter, item } = await createOwnerRenterAndItem();

    await expect(
      createTestReservation(item.id, renter.id, {
        startDate: '2026-12-04',
        endDate: '2026-12-03',
      }),
    ).rejects.toThrow('reserva_fechas_en_orden');
  });

  it('la BD rechaza un importe de 0', async () => {
    const { renter, item } = await createOwnerRenterAndItem();

    await expect(
      createTestReservation(item.id, renter.id, { totalPrice: 0 }),
    ).rejects.toThrow('reserva_precio_total_positivo');
  });

  it('no se puede borrar un objeto ni un usuario con reservas', async () => {
    const { renter, item } = await createOwnerRenterAndItem();
    await createTestReservation(item.id, renter.id);

    await expect(
      prisma.item.delete({ where: { id: item.id } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(
      prisma.user.delete({ where: { id: renter.id } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('resetDb() vacía las reservas', async () => {
    const { renter, item } = await createOwnerRenterAndItem();
    await createTestReservation(item.id, renter.id);

    await resetDb();

    expect(await prisma.reservation.count()).toBe(0);
  });
});
