// Cancelar una reserva con penalización (US-04.05, #308). Contrato propuesto en el issue y aceptado
// por Alex: vista previa (GET) y cancelación (POST), con el mismo cálculo.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026
import { AppError } from '../errors/appError.js';
import {
  cancelIfAllowed,
  findReservationToCancel,
  type ReservationToCancel,
} from '../repositories/cancellationRepository.js';
import { findReservationDetail } from '../repositories/reservationDecisionRepository.js';
import {
  planCancellation,
  type CancelRole,
  type CancellationPlan,
  type GatewayCall,
} from './cancellationPolicy.js';
import { refund, release } from './paymentGateway.js';
import { expireOverdueReservations } from './reservationExpiry.js';
import { toReservationDetail, type ReservationDetail } from './reservation.js';

export const NOT_FOUND_MESSAGE = 'No hemos encontrado esta reserva.';
export const NOT_PARTICIPANT_MESSAGE =
  'Solo el arrendatario o el propietario pueden cancelar esta reserva.';
export const NOT_CANCELLABLE_MESSAGE = 'Esta reserva ya no se puede cancelar.';
export const CANCEL_FAILED_MESSAGE =
  'No se ha podido cancelar. Inténtalo de nuevo.';

export interface CancellationPreview {
  daysUntilStart: number;
  penaltyPercent: number;
  penaltyAmount: string;
  refundAmount: string;
  free: boolean;
  releasesHold: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Solo el mensaje: nunca tokens, referencias ni la cabecera Authorization.
function logGatewayError(error: unknown): void {
  console.error(
    'La pasarela no ha podido mover el dinero de una cancelación:',
    error instanceof Error ? error.message : 'error desconocido',
  );
}

// Antes de decidir se caducan las solicitudes vencidas del usuario: una pendiente que ya venció
// se ve «caducada» y no se puede cancelar (#343).
async function findParticipantReservation(
  userId: string,
  id: string,
  now: Date,
): Promise<{ reservation: ReservationToCancel; role: CancelRole }> {
  await expireOverdueReservations(userId, now);

  const reservation = UUID_PATTERN.test(id)
    ? await findReservationToCancel(id)
    : null;
  if (!reservation) {
    throw new AppError(404, NOT_FOUND_MESSAGE);
  }

  if (reservation.renterId === userId) {
    return { reservation, role: 'renter' };
  }
  if (reservation.ownerId === userId) {
    return { reservation, role: 'owner' };
  }
  throw new AppError(403, NOT_PARTICIPANT_MESSAGE);
}

// Lo que costaría cancelar hoy, desde la posición de quien pregunta.
export async function getCancellationPreview(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<CancellationPreview> {
  const { reservation, role } = await findParticipantReservation(
    userId,
    id,
    now,
  );
  const plan = planCancellation(role, reservation, now);
  if (!plan) {
    throw new AppError(409, NOT_CANCELLABLE_MESSAGE);
  }

  return {
    daysUntilStart: plan.daysUntilStart,
    penaltyPercent: plan.penaltyPercent,
    penaltyAmount: plan.penaltyAmount.toFixed(2),
    refundAmount: plan.refundAmount.toFixed(2),
    free: plan.free,
    releasesHold: plan.releasesHold,
  };
}

async function callGateway(call: GatewayCall): Promise<void> {
  if (call.action === 'release') {
    await release(call.reference);
  } else {
    await refund(call.reference, call.amountCents);
  }
}

async function moveMoney(plan: CancellationPlan): Promise<void> {
  for (const call of plan.gatewayCalls) {
    try {
      await callGateway(call);
    } catch (error) {
      logGatewayError(error);
      throw new AppError(502, CANCEL_FAILED_MESSAGE);
    }
  }
}

export async function cancelReservation(
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<ReservationDetail> {
  const { reservation, role } = await findParticipantReservation(
    userId,
    id,
    now,
  );
  if (!planCancellation(role, reservation, now)) {
    throw new AppError(409, NOT_CANCELLABLE_MESSAGE);
  }

  // Se vuelve a decidir dentro de la transacción, con la reserva bloqueada.
  const cancelled = await cancelIfAllowed(
    reservation,
    userId,
    (locked) => planCancellation(role, locked, now),
    moveMoney,
  );
  if (!cancelled) {
    throw new AppError(409, NOT_CANCELLABLE_MESSAGE);
  }

  return toReservationDetail(await findReservationDetail(id));
}
