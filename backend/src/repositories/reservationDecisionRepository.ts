// Aceptar y rechazar solicitudes (US-04.03 y US-04.04, #125).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 02/11/2026; cobro y liberación (#343) revisado por Alex Matos, 17/11/2026
import type { ReservationStatus } from '@prisma/client';
import { reservationDetailInclude } from './detailIncludes.js';
import { prisma } from './prisma.js';
import {
  expirePending,
  isOverdue,
  nonNullReferences,
  notOverdueWhere,
  type ExpiryLimits,
} from './reservationExpiryRepository.js';

// Cobrar o soltar en la pasarela ocurre dentro de la transacción y puede tardar más que los 5 s
// de Prisma por defecto.
const TRANSACTION_TIMEOUT_MS = 20_000;

export type AcceptOutcome =
  | { outcome: 'accepted'; releaseReferences: string[] }
  | { outcome: 'expired'; releaseReferences: string[] }
  | { outcome: 'not_pending' }
  | { outcome: 'overlapping' };

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
// Si la solicitud está vencida, se caduca y se confirma esa caducidad (se devuelve «expired» en
// lugar de lanzar, para que no se deshaga). `capture` cobra lo bloqueado y se llama justo antes de
// confirmar: si lanza, se deshace todo y la solicitud sigue pendiente.
export function acceptIfAvailable(
  reservation: {
    id: string;
    itemId: string;
    startDate: Date;
    endDate: Date;
  },
  occupyingStatuses: readonly ReservationStatus[],
  limits: ExpiryLimits,
  capture: (reference: string) => Promise<void>,
): Promise<AcceptOutcome> {
  const { id, itemId, startDate, endDate } = reservation;

  return prisma.$transaction(
    async (transaction): Promise<AcceptOutcome> => {
      await transaction.$queryRaw`SELECT id FROM objeto WHERE id = ${itemId}::uuid FOR UPDATE`;

      const current = await transaction.reservation.findUnique({
        where: { id },
        select: {
          status: true,
          expiresAt: true,
          startDate: true,
          payment: { select: { rentalReference: true } },
        },
      });
      if (current?.status !== 'pending') {
        return { outcome: 'not_pending' };
      }

      if (isOverdue(current, limits)) {
        const expired = await expirePending(transaction, id);
        return expired
          ? {
              outcome: 'expired',
              releaseReferences: nonNullReferences([expired.reference]),
            }
          : { outcome: 'not_pending' };
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
        return { outcome: 'overlapping' };
      }

      // Condicional: rechazar o caducar no bloquean el objeto y podrían haber llegado justo antes.
      // Con pago, la reserva pasa a «pagada»; sin pago (flujo antiguo), a «aceptada».
      const { count } = await transaction.reservation.updateMany({
        where: { id, status: 'pending', ...notOverdueWhere(limits) },
        data: { status: current.payment ? 'paid' : 'accepted' },
      });
      if (count !== 1) {
        return { outcome: 'not_pending' };
      }
      if (current.payment) {
        await transaction.payment.update({
          where: { reservationId: id },
          data: { status: 'paid' },
        });
      }

      // Las otras solicitudes pendientes con fechas solapadas ya no pueden aceptarse.
      const competitors = await transaction.reservation.findMany({
        where: {
          itemId,
          id: { not: id },
          status: 'pending',
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: { id: true, payment: { select: { rentalReference: true } } },
      });
      const releaseReferences: (string | null)[] = [];
      for (const competitor of competitors) {
        const rejected = await transaction.reservation.updateMany({
          where: { id: competitor.id, status: 'pending' },
          data: { status: 'rejected' },
        });
        if (rejected.count === 1) {
          await transaction.payment.updateMany({
            where: { reservationId: competitor.id, status: 'authorized' },
            data: { status: 'released' },
          });
          releaseReferences.push(competitor.payment?.rentalReference ?? null);
        }
      }

      // Lo último antes de confirmar: si el cobro falla, no queda nada a medias.
      const reference = current.payment?.rentalReference;
      if (reference) {
        await capture(reference);
      }

      return {
        outcome: 'accepted',
        releaseReferences: nonNullReferences(releaseReferences),
      };
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}

// Transición única: solo cambia si sigue pendiente, aunque lleguen dos peticiones a la vez. El pago
// pasa a «liberado» y `release` suelta el bloqueo antes de confirmar: si lanza, se deshace todo y
// la solicitud sigue pendiente. Una solicitud vencida se rechaza igual (es lo más simple y lo que
// el propietario ha pedido); la caducidad solo la marcan las lecturas y aceptar.
export function rejectIfPending(
  id: string,
  release: (reference: string) => Promise<void>,
): Promise<boolean> {
  return prisma.$transaction(
    async (transaction) => {
      const { count } = await transaction.reservation.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'rejected' },
      });
      if (count !== 1) {
        return false;
      }

      const payment = await transaction.payment.findUnique({
        where: { reservationId: id },
        select: { rentalReference: true },
      });
      if (payment) {
        await transaction.payment.updateMany({
          where: { reservationId: id, status: 'authorized' },
          data: { status: 'released' },
        });
        if (payment.rentalReference) {
          await release(payment.rentalReference);
        }
      }

      return true;
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}
