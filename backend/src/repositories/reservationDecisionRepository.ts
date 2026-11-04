// Aceptar y rechazar solicitudes (US-04.03 y US-04.04, #125).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 02/11/2026
import type { ReservationStatus } from '@prisma/client';
import { reservationDetailInclude } from './detailIncludes.js';
import { prisma } from './prisma.js';

export type AcceptOutcome = 'accepted' | 'not_pending' | 'overlapping';

// Lo que hace falta para decidir: de quién es el objeto, las fechas y el estado.
export function findReservationForDecision(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    select: {
      status: true,
      itemId: true,
      startDate: true,
      endDate: true,
      item: { select: { ownerId: true } },
    },
  });
}

export function findReservationDetail(id: string) {
  return prisma.reservation.findUniqueOrThrow({
    where: { id },
    include: reservationDetailInclude,
  });
}

// Bloquea la fila del objeto durante la transacción: así, dos aceptaciones del mismo objeto van
// una detrás de otra y no pueden aprobar a la vez dos solicitudes con fechas solapadas.
export function acceptIfAvailable(
  reservation: {
    id: string;
    itemId: string;
    startDate: Date;
    endDate: Date;
  },
  occupyingStatuses: readonly ReservationStatus[],
): Promise<AcceptOutcome> {
  const { id, itemId, startDate, endDate } = reservation;

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM objeto WHERE id = ${itemId}::uuid FOR UPDATE`;

    const current = await transaction.reservation.findUnique({
      where: { id },
      select: { status: true },
    });
    if (current?.status !== 'pending') {
      return 'not_pending';
    }

    const overlapping = await transaction.reservation.findFirst({
      where: {
        itemId,
        id: { not: id },
        status: { in: [...occupyingStatuses] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true },
    });
    if (overlapping) {
      return 'overlapping';
    }

    // Condicional: rechazar no bloquea el objeto y podría haber llegado justo antes.
    const { count } = await transaction.reservation.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'accepted' },
    });
    return count === 1 ? 'accepted' : 'not_pending';
  });
}

// Transición única: solo cambia si sigue pendiente, aunque lleguen dos peticiones a la vez.
export async function rejectIfPending(id: string): Promise<boolean> {
  const { count } = await prisma.reservation.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'rejected' },
  });

  return count === 1;
}
