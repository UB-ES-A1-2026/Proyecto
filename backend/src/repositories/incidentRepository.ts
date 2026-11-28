// Incidencias de un alquiler (US-09.01, #76, tarea #456).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 28/11/2026
import type { IncidentType } from '@prisma/client';
import { prisma } from './prisma.js';

// Lo necesario para decidir si el usuario puede abrir una incidencia en esta reserva.
export function findReservationForIncident(reservationId: string) {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      status: true,
      renterId: true,
      item: { select: { ownerId: true } },
      delivery: { select: { returnedAt: true } },
      incident: { select: { id: true } },
    },
  });
}

export class DepositAlreadyReleased extends Error {}

// Crea la incidencia. Bloquea antes el pago, como releaseDeposit: si la fianza se está liberando a
// la vez, espera, y si ya se ha liberado no la abre (lanza DepositAlreadyReleased). Una segunda
// incidencia en la misma reserva choca con el índice único (P2002).
export function createIncident(data: {
  reservationId: string;
  openedById: string;
  type: IncidentType;
  description: string;
}) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT id FROM "pago" WHERE "reserva_id" = ${data.reservationId}::uuid FOR UPDATE`;
    const payment = await transaction.payment.findUnique({
      where: { reservationId: data.reservationId },
      select: { depositStatus: true },
    });
    if (
      payment?.depositStatus === 'released' ||
      payment?.depositStatus === 'returned'
    ) {
      throw new DepositAlreadyReleased();
    }
    return transaction.incident.create({ data });
  });
}
