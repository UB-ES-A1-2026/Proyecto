// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import type { DeliveryMode, Prisma, ReservationStatus } from '@prisma/client';
import { reservationDetailInclude } from './detailIncludes.js';
import { prisma } from './prisma.js';

// Datos del objeto que hacen falta para validar una solicitud y calcular su importe.
export function findItemForReservation(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
    select: {
      ownerId: true,
      status: true,
      dailyPrice: true,
      neighborhood: true,
      address: true,
      homeDelivery: true,
      riderDelivery: true,
      pickupPointDelivery: true,
    },
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

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Entrega de la solicitud (US-05.01, #281): se guarda en la misma transacción que la reserva.
export interface ReservationDeliveryData {
  mode: DeliveryMode;
  pickupPointId?: string;
  // NULL = «Lo antes posible».
  slot?: string | null;
  deliveryAddress?: string;
  deliveryNeighborhood?: string;
  fee?: string;
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
    delivery: ReservationDeliveryData;
  },
  occupyingStatuses: readonly ReservationStatus[],
): Promise<InsertReservationResult> {
  const { itemId, renterId, startDate, endDate, delivery } = data;
  const { mode, ...deliveryFields } = delivery;

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
      data: {
        itemId,
        renterId,
        startDate,
        endDate,
        totalPrice: data.totalPrice,
        deliveryMode: mode,
        delivery: { create: deliveryFields },
      },
      include: reservationDetailInclude,
    });

    return { outcome: 'created', reservation };
  });
}
