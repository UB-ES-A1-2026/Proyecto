import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/repositories/prisma.js';
import { reservationDetailInclude } from '../../src/repositories/detailIncludes.js';
import { toReservationDetail } from '../../src/services/reservation.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestUser } from '../helpers/users.js';

// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026

beforeEach(async () => {
  await resetDb();
});

describe('toReservationDetail', () => {
  it('returns the agreed shape, without emails', async () => {
    const owner = await createTestUser();
    const renter = await createTestUser({
      username: 'bruno',
      email: 'bruno@rentit.test',
    });
    const item = await createTestItem(owner.id);
    const { id } = await createTestReservation(item.id, renter.id, {
      startDate: '2026-12-04',
      endDate: '2026-12-06',
      totalPrice: 15,
    });

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id },
      include: reservationDetailInclude,
    });

    expect(toReservationDetail(reservation)).toEqual({
      id,
      item: { id: item.id, title: item.title },
      startDate: '2026-12-04',
      endDate: '2026-12-06',
      totalPrice: '15.00',
      deposit: '30.00',
      deliveryAmount: '0.00',
      status: 'pending',
      expiresAt: null,
      renter: { id: renter.id, username: 'bruno' },
      owner: { id: owner.id, username: 'ana' },
      createdAt: reservation.createdAt,
    });
  });
});
