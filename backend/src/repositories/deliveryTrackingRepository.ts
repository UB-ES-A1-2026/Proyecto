// Seguimiento de la entrega (US-05.02, #288).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026
import { prisma } from './prisma.js';
import type { DeliveryStatus } from '@prisma/client';

// La reserva con su entrega y lo necesario para decidir quién puede verla y qué puede hacer:
// el arrendatario, el propietario del objeto y el rider de la entrega.
export function findReservationForTracking(reservationId: string) {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      status: true,
      renterId: true,
      deliveryMode: true,
      item: { select: { ownerId: true } },
      delivery: {
        select: {
          status: true,
          riderId: true,
          deliveryCode: true,
          codeAttempts: true,
          assignedAt: true,
          pickedUpAt: true,
          onTheWayAt: true,
          deliveredAt: true,
          returnedAt: true,
          rider: { select: { id: true, username: true } },
        },
      },
    },
  });
}

// Hora de cada estado del rider antes de la entrega.
const RIDER_STEP_TIME = {
  picked_up: 'pickedUpAt',
  on_the_way: 'onTheWayAt',
} as const;

// Pasa la entrega de `from` a `to` y guarda la hora. Solo cambia si sigue en `from`: con un doble
// clic o dos peticiones a la vez, la segunda no encuentra la entrega en `from` y devuelve false.
export async function moveDelivery(
  reservationId: string,
  from: DeliveryStatus,
  to: keyof typeof RIDER_STEP_TIME,
  at: Date,
): Promise<boolean> {
  const { count } = await prisma.delivery.updateMany({
    where: { reservationId, status: from },
    data: { status: to, [RIDER_STEP_TIME[to]]: at },
  });
  return count === 1;
}

// Suma un intento fallido de código, solo mientras queden intentos: así nunca pasa del máximo,
// ni con dos peticiones a la vez. Devuelve false si ya estaba bloqueado.
export async function recordFailedCodeAttempt(
  reservationId: string,
  maxAttempts: number,
): Promise<boolean> {
  const { count } = await prisma.delivery.updateMany({
    where: { reservationId, codeAttempts: { lt: maxAttempts } },
    data: { codeAttempts: { increment: 1 } },
  });
  return count === 1;
}

class DeliveryConflict extends Error {}

// Con el código correcto: la entrega pasa a «Entregada» y la reserva a «En curso», las dos en la
// misma transacción. Devuelve false, sin cambiar nada, si otra petición se ha adelantado.
export async function markDelivered(
  reservationId: string,
  from: DeliveryStatus,
  at: Date,
): Promise<boolean> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.updateMany({
        where: { reservationId, status: from },
        data: { status: 'delivered', deliveredAt: at },
      });
      const reservation = await transaction.reservation.updateMany({
        where: { id: reservationId, status: 'paid' },
        data: { status: 'in_progress' },
      });
      if (delivery.count !== 1 || reservation.count !== 1) {
        // Deshace lo que se haya cambiado dentro de la transacción.
        throw new DeliveryConflict();
      }
      return true;
    });
  } catch (error) {
    if (error instanceof DeliveryConflict) return false;
    throw error;
  }
}

// «He devuelto el objeto»: la reserva pasa de «En curso» a «Finalizada» y la entrega guarda la
// hora de la devolución, las dos en la misma transacción. false si ya no estaba en curso.
export async function markReturned(
  reservationId: string,
  at: Date,
): Promise<boolean> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const reservation = await transaction.reservation.updateMany({
        where: { id: reservationId, status: 'in_progress' },
        data: { status: 'finished' },
      });
      const delivery = await transaction.delivery.updateMany({
        where: { reservationId, status: 'delivered', returnedAt: null },
        data: { returnedAt: at },
      });
      if (reservation.count !== 1 || delivery.count !== 1) {
        throw new DeliveryConflict();
      }
      return true;
    });
  } catch (error) {
    if (error instanceof DeliveryConflict) return false;
    throw error;
  }
}
