// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/repositories/prisma.js';
import { resetDb } from '../helpers/db.js';
import { createTestItem } from '../helpers/items.js';
import { createTestReservation } from '../helpers/reservations.js';
import { createTestAdmin, createTestUser } from '../helpers/users.js';

// Retirada de objetos por un admin (US-11.03, #317): lo que garantiza la BD.

async function setup() {
  const owner = await createTestUser();
  const admin = await createTestAdmin();
  const item = await createTestItem(owner.id);
  return { owner, admin, item };
}

beforeEach(async () => {
  await resetDb();
});

describe('retirada_objeto', () => {
  it('guarda el motivo, los detalles y la fecha', async () => {
    const { admin, item } = await setup();

    const moderation = await prisma.itemModeration.create({
      data: {
        itemId: item.id,
        adminId: admin.id,
        reason: 'scam',
        details: 'Fotos robadas.',
      },
    });

    expect(moderation).toMatchObject({
      reason: 'scam',
      details: 'Fotos robadas.',
    });
    expect(moderation.withdrawnAt).toBeInstanceOf(Date);
  });

  it('solo admite una retirada por objeto', async () => {
    const { admin, item } = await setup();
    const data = {
      itemId: item.id,
      adminId: admin.id,
      reason: 'scam' as const,
    };
    await prisma.itemModeration.create({ data });

    await expect(prisma.itemModeration.create({ data })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it.each([null, '', '   '])(
    'con motivo «otro» no admite detalles vacíos (%j)',
    async (details) => {
      const { admin, item } = await setup();

      await expect(
        prisma.itemModeration.create({
          data: {
            itemId: item.id,
            adminId: admin.id,
            reason: 'other',
            details,
          },
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    },
  );

  it('con motivo «otro» y detalles se guarda; sin detalles vale con los demás motivos', async () => {
    const { admin, item } = await setup();
    const other = await createTestItem(admin.id, { title: 'Otro' });

    await prisma.itemModeration.create({
      data: {
        itemId: item.id,
        adminId: admin.id,
        reason: 'other',
        details: 'Motivo',
      },
    });
    await prisma.itemModeration.create({
      data: { itemId: other.id, adminId: admin.id, reason: 'misleading' },
    });

    expect(await prisma.itemModeration.count()).toBe(2);
  });

  it('un objeto o un admin con retirada no se pueden borrar', async () => {
    const { admin, item } = await setup();
    await prisma.itemModeration.create({
      data: { itemId: item.id, adminId: admin.id, reason: 'prohibited' },
    });

    await expect(
      prisma.item.delete({ where: { id: item.id } }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(
      prisma.user.delete({ where: { id: admin.id } }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
  });
});

describe('reserva.motivo_cancelacion', () => {
  it('es opcional y admite «objeto_retirado»', async () => {
    const { owner, item } = await setup();
    const renter = await createTestUser({
      username: 'bruno',
      email: 'bruno@rentit.test',
    });
    const reservation = await createTestReservation(item.id, renter.id);
    expect(reservation.cancellationReason).toBeNull();

    const updated = await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'cancelled', cancellationReason: 'item_withdrawn' },
    });

    expect(updated.cancellationReason).toBe('item_withdrawn');
    expect(owner.id).toBeDefined();
  });
});
