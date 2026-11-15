// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import type { Prisma, ReservationStatus } from '@prisma/client';
import { reservationDetailInclude } from './detailIncludes.js';
import { prisma } from './prisma.js';

// Datos del objeto que hacen falta para validar una solicitud y calcular su importe.
export function findItemForReservation(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
    select: { ownerId: true, status: true, dailyPrice: true, deposit: true },
  });
}

// Las dos fechas cuentan: una reserva que acaba el día que empieza esta se solapa.
function overlappingReservationsWhere(
  itemId: string,
  startDate: Date,
  endDate: Date,
  occupyingStatuses: readonly ReservationStatus[],
): Prisma.ReservationWhereInput {
  return {
    itemId,
    status: { in: [...occupyingStatuses] },
    startDate: { lte: endDate },
    endDate: { gte: startDate },
  };
}

// Solo informa: al crear la solicitud se vuelve a comprobar con el objeto bloqueado.
export async function hasOverlappingReservation(
  itemId: string,
  startDate: Date,
  endDate: Date,
  occupyingStatuses: readonly ReservationStatus[],
): Promise<boolean> {
  const overlapping = await prisma.reservation.findFirst({
    where: overlappingReservationsWhere(
      itemId,
      startDate,
      endDate,
      occupyingStatuses,
    ),
    select: { id: true },
  });

  return overlapping !== null;
}

// Comprobación previa, sin bloquear el objeto: si ya hay una solicitud igual o las fechas están
// ocupadas, se responde antes de bloquear nada en la pasarela (#72). Al crear la reserva se vuelve
// a comprobar dentro de la transacción, por si alguien se adelanta entre medias.
export async function findReservationConflict(
  data: { itemId: string; renterId: string; startDate: Date; endDate: Date },
  occupyingStatuses: readonly ReservationStatus[],
): Promise<'duplicate' | 'overlapping' | null> {
  const { itemId, renterId, startDate, endDate } = data;

  const duplicate = await prisma.reservation.findFirst({
    where: { itemId, renterId, startDate, endDate, status: 'pending' },
    select: { id: true },
  });
  if (duplicate) {
    return 'duplicate';
  }

  const overlapping = await hasOverlappingReservation(
    itemId,
    startDate,
    endDate,
    occupyingStatuses,
  );
  return overlapping ? 'overlapping' : null;
}

export type InsertReservationResult =
  | {
      outcome: 'created';
      reservation: Prisma.ReservationGetPayload<{
        include: typeof reservationDetailInclude;
      }>;
    }
  | { outcome: 'not_published' | 'duplicate' | 'overlapping' };

// Crea la solicitud si se puede. Bloquea la fila del objeto durante la transacción, como aceptar
// (#125): así, un doble clic no crea dos solicitudes iguales y, si el objeto se retira o se acepta
// otra reserva a la vez, esta solicitud lo tiene en cuenta.
export function insertReservationIfAvailable(
  data: {
    itemId: string;
    renterId: string;
    startDate: Date;
    endDate: Date;
    totalPrice: Prisma.Decimal;
    expiresAt: Date;
  },
  // El pago del bloqueo hecho en la pasarela (US-07.01, #72): se guarda junto con la reserva.
  payment: {
    rentalAmount: Prisma.Decimal;
    depositAmount: Prisma.Decimal;
    depositStatus: 'pending' | null;
    rentalReference: string;
  },
  occupyingStatuses: readonly ReservationStatus[],
): Promise<InsertReservationResult> {
  const { itemId, renterId, startDate, endDate } = data;

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM objeto WHERE id = ${itemId}::uuid FOR UPDATE`;

    const item = await transaction.item.findUnique({
      where: { id: itemId },
      select: { status: true },
    });
    if (item?.status !== 'published') {
      return { outcome: 'not_published' };
    }

    const duplicate = await transaction.reservation.findFirst({
      where: { itemId, renterId, startDate, endDate, status: 'pending' },
      select: { id: true },
    });
    if (duplicate) {
      return { outcome: 'duplicate' };
    }

    const overlapping = await transaction.reservation.findFirst({
      where: overlappingReservationsWhere(
        itemId,
        startDate,
        endDate,
        occupyingStatuses,
      ),
      select: { id: true },
    });
    if (overlapping) {
      return { outcome: 'overlapping' };
    }

    const reservation = await transaction.reservation.create({
      data: { ...data, payment: { create: payment } },
      include: reservationDetailInclude,
    });

    return { outcome: 'created', reservation };
  });
}
