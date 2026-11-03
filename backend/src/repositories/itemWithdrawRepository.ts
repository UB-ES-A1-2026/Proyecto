// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import type { ReservationStatus } from '@prisma/client';
import { prisma } from './prisma.js';

export function findItemOwnerAndStatus(id: string) {
  return prisma.item.findUnique({
    where: { id },
    select: { ownerId: true, status: true },
  });
}

// Retira el objeto solo si no estaba retirado y no tiene reservas en esos estados. Va en una
// única sentencia para que no se cuele una solicitud entre la comprobación y el cambio.
// Devuelve false si no se ha podido retirar.
export async function withdrawItemIfNoActiveReservations(
  id: string,
  activeStatuses: readonly ReservationStatus[],
): Promise<boolean> {
  const { count } = await prisma.item.updateMany({
    where: {
      id,
      status: { not: 'withdrawn' },
      reservations: { none: { status: { in: [...activeStatuses] } } },
    },
    data: { status: 'withdrawn' },
  });

  return count === 1;
}

export function findWithdrawnItemSummary(id: string) {
  return prisma.item.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      title: true,
      dailyPrice: true,
      neighborhood: true,
      status: true,
    },
  });
}
