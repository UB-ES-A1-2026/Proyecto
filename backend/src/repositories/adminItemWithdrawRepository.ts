// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026
// Retirada de un objeto por un admin (US-11.03, #317).
import type { WithdrawalReason } from '@prisma/client';
import { prisma } from './prisma.js';

export function itemExists(id: string): Promise<boolean> {
  return prisma.item
    .findUnique({ where: { id }, select: { id: true } })
    .then((item) => item !== null);
}

// Todo o nada, en una transacción: pasa el objeto a «retirado» solo si no lo estaba (la condición
// y el cambio son una sola sentencia, así que dos retiradas a la vez no se pisan), guarda la
// moderación y cancela sus reservas pendientes y aceptadas. Las pagadas, en curso y finalizadas
// no se tocan. Devuelve false, sin cambiar nada, si el objeto ya estaba retirado.
export function withdrawItemByAdmin(
  itemId: string,
  data: {
    adminId: string;
    reason: WithdrawalReason;
    details: string | null;
  },
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.item.updateMany({
      where: { id: itemId, status: { not: 'withdrawn' } },
      data: { status: 'withdrawn' },
    });
    if (count === 0) return false;

    await tx.itemModeration.create({ data: { itemId, ...data } });
    await tx.reservation.updateMany({
      where: { itemId, status: { in: ['pending', 'accepted'] } },
      data: { status: 'cancelled', cancellationReason: 'item_withdrawn' },
    });
    return true;
  });
}
