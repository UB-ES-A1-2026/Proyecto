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
      startDate: true,
      endDate: true,
      renter: { select: { id: true, username: true } },
      item: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          address: true,
          owner: { select: { id: true, username: true } },
        },
      },
      delivery: {
        select: {
          status: true,
          slot: true,
          pickupPoint: { select: { name: true, address: true } },
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

// La fianza que hay que soltar (retenida) o devolver (cobrada) (#402).
export type DepositToSettle = {
  reference: string;
  action: 'release' | 'refund';
};

// Stripe va dentro de la transacción (un reembolso son hasta 3 llamadas): los 5 s por defecto de
// Prisma no bastan, como en reservationDecisionRepository.
const TRANSACTION_TIMEOUT_MS = 20_000;

// «He devuelto el objeto»: la reserva pasa de «En curso» a «Finalizada» y la entrega guarda la
// hora de la devolución, las dos en la misma transacción. false si ya no estaba en curso.
// La fianza ya no se libera aquí (US-09.01, #456): se queda 48 h por si el propietario abre una
// incidencia, y la libera releaseDeposit (depositService.releaseReturnedDeposits).
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

// Libera la fianza de una reserva finalizada (#402, US-09.01): retenida → liberada; cobrada →
// devuelta; pendiente (no se llegó a retener) → liberada. Una ejecutada por daños, ya liberada o
// con una incidencia abierta no se toca. Stripe se llama dentro de la transacción: si falla, no
// cambia nada y se reintenta en la siguiente lectura. Devuelve si la ha liberado.
export async function releaseDeposit(
  reservationId: string,
  settleDeposit: (deposit: DepositToSettle) => Promise<void>,
): Promise<boolean> {
  return prisma.$transaction(
    async (transaction) => {
      // Bloquea el pago: abrir una incidencia a la vez (incidentRepository) espera a que acabe.
      await transaction.$executeRaw`SELECT id FROM "pago" WHERE "reserva_id" = ${reservationId}::uuid FOR UPDATE`;
      const openIncident = await transaction.incident.count({
        where: { reservationId, status: 'open' },
      });
      if (openIncident > 0) return false;

      // Si la retención del día antes (settleDueDeposits) la guarda justo entre la lectura y el
      // cambio, el cambio no encuentra la fila: se vuelve a leer una vez con el estado nuevo.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const payment = await transaction.payment.findUnique({
          where: { reservationId },
          select: { depositStatus: true, depositReference: true },
        });
        const status = payment?.depositStatus;
        if (
          status !== 'held' &&
          status !== 'collected' &&
          status !== 'pending'
        ) {
          return false;
        }
        const { count } = await transaction.payment.updateMany({
          where: { reservationId, depositStatus: status },
          data: {
            depositStatus: status === 'collected' ? 'returned' : 'released',
          },
        });
        if (count !== 1) continue;
        if (status !== 'pending' && payment?.depositReference) {
          await settleDeposit({
            reference: payment.depositReference,
            action: status === 'collected' ? 'refund' : 'release',
          });
        }
        return true;
      }
      return false;
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}

// Código nuevo (US-05.02, #288): sustituye al anterior y vuelve a dar los 5 intentos. Solo si la
// entrega aún no se ha hecho. Devuelve false si ya estaba entregada.
export async function renewDeliveryCode(
  reservationId: string,
  code: string,
): Promise<boolean> {
  const { count } = await prisma.delivery.updateMany({
    where: { reservationId, status: { not: 'delivered' } },
    data: { deliveryCode: code, codeAttempts: 0 },
  });
  return count === 1;
}
