import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser } from '../helpers/users.js';

// Tabla `cancelacion` (US-04.05, #308): una fila por reserva y las reglas que solo están en la BD.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026

async function setUp() {
  const owner = await createTestUser();
  const renter = await createTestUser({
    username: 'bruno',
    email: 'bruno@rentit.test',
  });
  const item = await createTestItem(owner.id);
  const reservation = await createTestReservation(item.id, renter.id, {
    status: 'cancelled',
  });
  return { owner, renter, reservation };
}

function cancellationData(
  reservationId: string,
  cancelledById: string,
  overrides: Partial<{
    penaltyPercent: number;
    penaltyAmount: number;
    refundAmount: number;
  }> = {},
) {
  return {
    reservationId,
    cancelledById,
    penaltyPercent: overrides.penaltyPercent ?? 35,
    penaltyAmount: overrides.penaltyAmount ?? 5.25,
    refundAmount: overrides.refundAmount ?? 9.75,
  };
}

beforeEach(async () => {
  await resetDb();
});

describe('cancelacion', () => {
  it('guarda quién cancela, cuándo y los importes con 2 decimales', async () => {
    const { renter, reservation } = await setUp();

    const cancellation = await prisma.cancellation.create({
      data: cancellationData(reservation.id, renter.id),
    });

    expect(cancellation.cancelledAt).toBeInstanceOf(Date);
    expect(cancellation.penaltyAmount.toFixed(2)).toBe('5.25');
    expect(cancellation.refundAmount.toFixed(2)).toBe('9.75');
  });

  it('solo admite una cancelación por reserva', async () => {
    const { renter, reservation } = await setUp();
    await prisma.cancellation.create({
      data: cancellationData(reservation.id, renter.id),
    });

    await expect(
      prisma.cancellation.create({
        data: cancellationData(reservation.id, renter.id),
      }),
    ).rejects.toThrow();
  });

  it.each([1, 34, 50, 101])(
    'la BD rechaza un porcentaje que no sea 0, 35 o 100 (%i)',
    async (penaltyPercent) => {
      const { renter, reservation } = await setUp();

      await expect(
        prisma.cancellation.create({
          data: cancellationData(reservation.id, renter.id, { penaltyPercent }),
        }),
      ).rejects.toThrow();
    },
  );

  it.each([0, 35, 100])('acepta el porcentaje %i', async (penaltyPercent) => {
    const { renter, reservation } = await setUp();

    await expect(
      prisma.cancellation.create({
        data: cancellationData(reservation.id, renter.id, { penaltyPercent }),
      }),
    ).resolves.toBeDefined();
  });

  it('la BD rechaza una penalización o un reembolso negativos', async () => {
    const { renter, reservation } = await setUp();

    await expect(
      prisma.cancellation.create({
        data: cancellationData(reservation.id, renter.id, {
          penaltyAmount: -1,
        }),
      }),
    ).rejects.toThrow();
    await expect(
      prisma.cancellation.create({
        data: cancellationData(reservation.id, renter.id, { refundAmount: -1 }),
      }),
    ).rejects.toThrow();
  });

  it('una reserva o un usuario con cancelación no se pueden borrar', async () => {
    const { renter, reservation } = await setUp();
    await prisma.cancellation.create({
      data: cancellationData(reservation.id, renter.id),
    });

    await expect(
      prisma.reservation.delete({ where: { id: reservation.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.user.delete({ where: { id: renter.id } }),
    ).rejects.toThrow();
  });
});
