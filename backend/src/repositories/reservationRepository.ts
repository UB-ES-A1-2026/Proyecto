// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import type { Prisma, ReservationStatus } from '@prisma/client';
import { reservationDetailInclude } from '../services/reservation.js';
import { prisma } from './prisma.js';

// Datos del objeto que hacen falta para validar una solicitud y calcular su importe.
export function findItemForReservation(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
    select: { ownerId: true, status: true, dailyPrice: true },
  });
}

// ¿Alguna reserva del objeto en esos estados se solapa con las fechas? Las dos fechas cuentan.
export async function hasOverlappingReservation(
  itemId: string,
  startDate: Date,
  endDate: Date,
  statuses: readonly ReservationStatus[],
): Promise<boolean> {
  const overlapping = await prisma.reservation.findFirst({
    where: {
      itemId,
      status: { in: [...statuses] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });

  return overlapping !== null;
}

export function insertReservation(data: {
  itemId: string;
  renterId: string;
  startDate: Date;
  endDate: Date;
  totalPrice: Prisma.Decimal;
}) {
  return prisma.reservation.create({
    data,
    include: reservationDetailInclude,
  });
}
