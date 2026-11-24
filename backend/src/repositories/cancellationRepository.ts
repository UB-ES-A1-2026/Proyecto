// Cancelar una reserva con penalización (US-04.05, #308).
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026
import type {
  DepositStatus,
  PaymentStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';
import { prisma } from './prisma.js';

// Mover dinero en la pasarela ocurre dentro de la transacción y puede tardar más que los 5 s de
// Prisma por defecto (igual que al aceptar y rechazar, #343).
const TRANSACTION_TIMEOUT_MS = 20_000;

// Lo que hace falta leer de la reserva para decidir.
export interface ReservationToCancel {
  id: string;
  itemId: string;
  renterId: string;
  ownerId: string;
  status: ReservationStatus;
  startDate: Date;
  totalPrice: Prisma.Decimal;
  payment: {
    status: PaymentStatus;
    rentalAmount: Prisma.Decimal;
    deliveryAmount: Prisma.Decimal;
    depositStatus: DepositStatus | null;
    rentalReference: string | null;
    depositReference: string | null;
  } | null;
}

// Lo que se guarda al cancelar: la fila de `cancelacion` y los estados nuevos del pago.
export interface CancellationRecord {
  penaltyPercent: number;
  penaltyAmount: Prisma.Decimal;
  refundAmount: Prisma.Decimal;
  paymentStatus?: PaymentStatus;
  depositStatus?: DepositStatus;
}

const reservationToCancelSelect = {
  id: true,
  itemId: true,
  renterId: true,
  status: true,
  startDate: true,
  totalPrice: true,
  item: { select: { ownerId: true } },
  payment: {
    select: {
      status: true,
      rentalAmount: true,
      deliveryAmount: true,
      depositStatus: true,
      rentalReference: true,
      depositReference: true,
    },
  },
} satisfies Prisma.ReservationSelect;

function toReservationToCancel(
  reservation: Prisma.ReservationGetPayload<{
    select: typeof reservationToCancelSelect;
  }>,
): ReservationToCancel {
  const { item, ...rest } = reservation;
  return { ...rest, ownerId: item.ownerId };
}

export async function findReservationToCancel(
  id: string,
): Promise<ReservationToCancel | null> {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: reservationToCancelSelect,
  });
  return reservation ? toReservationToCancel(reservation) : null;
}

// Cancela la reserva en una sola transacción. Bloquea la fila del objeto y después la de la reserva
// (el mismo orden que al aceptar), así dos cancelaciones a la vez van una detrás de otra: la
// segunda ya la ve cancelada. `plan` decide con la reserva ya bloqueada y devuelve null si ya no se
// puede cancelar (entonces no se toca nada y el resultado es null). `moveMoney` mueve el dinero en
// la pasarela justo antes de confirmar: si lanza, se deshace todo y la reserva no cambia.
export function cancelIfAllowed<Plan extends CancellationRecord>(
  target: { id: string; itemId: string },
  cancelledById: string,
  plan: (reservation: ReservationToCancel) => Plan | null,
  moveMoney: (plan: Plan) => Promise<void>,
): Promise<Plan | null> {
  const { id, itemId } = target;

  return prisma.$transaction(
    async (transaction): Promise<Plan | null> => {
      await transaction.$queryRaw`SELECT id FROM objeto WHERE id = ${itemId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT id FROM reserva WHERE id = ${id}::uuid FOR UPDATE`;

      const current = await transaction.reservation.findUnique({
        where: { id },
        select: reservationToCancelSelect,
      });
      const decided = current ? plan(toReservationToCancel(current)) : null;
      if (!current || !decided) {
        return null;
      }

      // Condicional: si otra petición la ha rechazado o caducado a la vez, no cambia nada.
      const { count } = await transaction.reservation.updateMany({
        where: { id, status: current.status },
        data: { status: 'cancelled' },
      });
      if (count !== 1) {
        return null;
      }

      await transaction.cancellation.create({
        data: {
          reservationId: id,
          cancelledById,
          penaltyPercent: decided.penaltyPercent,
          penaltyAmount: decided.penaltyAmount,
          refundAmount: decided.refundAmount,
        },
      });
      if (current.payment && (decided.paymentStatus || decided.depositStatus)) {
        await transaction.payment.update({
          where: { reservationId: id },
          data: {
            status: decided.paymentStatus,
            depositStatus: decided.depositStatus,
          },
        });
      }

      // Lo último antes de confirmar. Queda un caso: que la pasarela vaya bien y falle el commit;
      // entonces la reserva sigue como estaba y el reintento repite la llamada (Stripe, T10, trata
      // como éxito liberar o reembolsar lo que ya se liberó o reembolsó).
      await moveMoney(decided);

      return decided;
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}
