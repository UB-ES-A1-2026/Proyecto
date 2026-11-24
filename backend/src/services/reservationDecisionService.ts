// Aceptar y rechazar solicitudes (US-04.03 y US-04.04, #125). El contrato está en el issue.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 02/11/2026; cobro y liberación (#343) revisado por Alex Matos, 17/11/2026
import type { ReservationStatus } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  acceptIfAvailable,
  findReservationDetail,
  findReservationForDecision,
  rejectIfPending,
} from '../repositories/reservationDecisionRepository.js';
import { capture, release } from './paymentGateway.js';
import {
  EXPIRED_MESSAGE,
  expiryLimits,
  releaseHoldsBestEffort,
} from './reservationExpiry.js';
import { toReservationDetail, type ReservationDetail } from './reservation.js';

export const NOT_FOUND_MESSAGE = 'No hemos encontrado esta solicitud.';
export const NOT_OWNER_MESSAGE =
  'Solo el propietario del objeto puede responder a esta solicitud.';
export const NOT_PENDING_MESSAGE = 'Esta solicitud ya no está pendiente.';
export const OVERLAPPING_MESSAGE =
  'Las fechas de esta solicitud se solapan con otra reserva ya aceptada.';

export const CAPTURE_FAILED_MESSAGE =
  'No se ha podido cobrar el pago. Inténtalo de nuevo.';
export const RELEASE_FAILED_MESSAGE =
  'No se ha podido liberar el importe bloqueado. Inténtalo de nuevo.';

// Solo el mensaje: nunca tokens ni la cabecera Authorization.
function logGatewayError(action: string, error: unknown): void {
  console.error(
    `La pasarela no ha podido ${action}:`,
    error instanceof Error ? error.message : 'error desconocido',
  );
}

// Estas reservas ocupan las fechas del objeto; las pendientes no (contrato de #120).
const OCCUPYING_STATUSES: readonly ReservationStatus[] = [
  'accepted',
  'paid',
  'in_progress',
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findOwnPendingReservation(userId: string, id: string) {
  const reservation = UUID_PATTERN.test(id)
    ? await findReservationForDecision(id)
    : null;

  if (!reservation) {
    throw new AppError(404, NOT_FOUND_MESSAGE);
  }
  if (reservation.item.ownerId !== userId) {
    throw new AppError(403, NOT_OWNER_MESSAGE);
  }
  if (reservation.status !== 'pending') {
    throw new AppError(409, NOT_PENDING_MESSAGE);
  }

  return reservation;
}

export async function acceptReservation(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<ReservationDetail> {
  const reservation = await findOwnPendingReservation(userId, id);
  const result = await acceptIfAvailable(
    { id, ...reservation },
    OCCUPYING_STATUSES,
    expiryLimits(now),
    async (reference) => {
      try {
        await capture(reference);
      } catch (error) {
        logGatewayError('cobrar', error);
        throw new AppError(502, CAPTURE_FAILED_MESSAGE);
      }
    },
  );

  if (result.outcome === 'not_pending') {
    throw new AppError(409, NOT_PENDING_MESSAGE);
  }
  if (result.outcome === 'overlapping') {
    throw new AppError(409, OVERLAPPING_MESSAGE, 'startDate');
  }

  // Ya confirmado: soltar los bloqueos de las solicitudes que se han cerrado.
  await releaseHoldsBestEffort(result.releaseReferences);

  if (result.outcome === 'expired') {
    throw new AppError(409, EXPIRED_MESSAGE);
  }

  return toReservationDetail(await findReservationDetail(id), 'owner');
}

export async function rejectReservation(
  userId: string,
  id: string,
): Promise<ReservationDetail> {
  await findOwnPendingReservation(userId, id);

  const rejected = await rejectIfPending(id, async (reference) => {
    try {
      await release(reference);
    } catch (error) {
      logGatewayError('liberar', error);
      throw new AppError(502, RELEASE_FAILED_MESSAGE);
    }
  });
  if (!rejected) {
    throw new AppError(409, NOT_PENDING_MESSAGE);
  }

  return toReservationDetail(await findReservationDetail(id), 'owner');
}
