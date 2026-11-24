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
// no se tocan. El pago de las pendientes pasa a «liberado» (US-07.01): devuelve las referencias
// de los bloqueos que hay que soltar en la pasarela, ya confirmada la transacción. Devuelve null,
// sin cambiar nada, si el objeto ya estaba retirado.
export function withdrawItemByAdmin(
  itemId: string,
  data: {
    adminId: string;
    reason: WithdrawalReason;
    details: string | null;
  },
): Promise<{ releaseReferences: string[] } | null> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.item.updateMany({
      where: { id: itemId, status: { not: 'withdrawn' } },
      data: { status: 'withdrawn' },
    });
    if (count === 0) return null;

    await tx.itemModeration.create({ data: { itemId, ...data } });

    // El objeto ya está retirado: nadie puede solicitarlo, y aceptar o rechazar a la vez cambia
    // el estado, que se vuelve a comprobar al cancelar cada una.
    const pending = await tx.reservation.findMany({
      where: { itemId, status: 'pending' },
      select: { id: true, payment: { select: { rentalReference: true } } },
      // Mismo orden que al aceptar y al caducar: así dos transacciones no se bloquean en cruz.
      orderBy: { id: 'asc' },
    });
    const releaseReferences: string[] = [];
    for (const reservation of pending) {
      const cancelled = await tx.reservation.updateMany({
        where: { id: reservation.id, status: 'pending' },
        data: { status: 'cancelled', cancellationReason: 'item_withdrawn' },
      });
      if (cancelled.count !== 1) continue;
      const released = await tx.payment.updateMany({
        where: { reservationId: reservation.id, status: 'authorized' },
        data: { status: 'released' },
      });
      // Sin referencia: pago de demo, sin pasarela.
      const reference = reservation.payment?.rentalReference;
      if (released.count === 1 && reference) {
        releaseReferences.push(reference);
      }
    }

    // Las aceptadas son del flujo antiguo, sin pago.
    await tx.reservation.updateMany({
      where: { itemId, status: 'accepted' },
      data: { status: 'cancelled', cancellationReason: 'item_withdrawn' },
    });
    return { releaseReferences };
  });
}
