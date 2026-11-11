// Registrar un pago (US-07.01 #72, T9 #284).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 11/11/2026
import { AppError } from '../errors/appError.js';
import {
  findReservationForPayment,
  recordPayment,
} from '../repositories/paymentRepository.js';
import { findReservationDetail } from '../repositories/reservationDecisionRepository.js';
import { chargeAndHoldDeposit } from './paymentGateway.js';
import { toReservationDetail, type ReservationDetail } from './reservation.js';

export const NOT_FOUND_MESSAGE = 'No hemos encontrado esta reserva.';
export const NOT_RENTER_MESSAGE =
  'Solo quien ha hecho la solicitud puede pagarla.';
export const NOT_ACCEPTED_MESSAGE =
  'Solo se puede pagar una solicitud aceptada.';
export const ALREADY_PAID_MESSAGE = 'Esta reserva ya está pagada.';
export const MISSING_CARD_MESSAGE = 'Introduce los datos de la tarjeta.';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function payReservation(
  userId: string,
  id: string,
  paymentMethodId: unknown,
): Promise<ReservationDetail> {
  const reservation = UUID_PATTERN.test(id)
    ? await findReservationForPayment(id)
    : null;

  if (!reservation) {
    throw new AppError(404, NOT_FOUND_MESSAGE);
  }
  if (reservation.renterId !== userId) {
    throw new AppError(403, NOT_RENTER_MESSAGE);
  }
  if (reservation.payment || reservation.status === 'paid') {
    throw new AppError(409, ALREADY_PAID_MESSAGE);
  }
  if (reservation.status !== 'accepted') {
    throw new AppError(409, NOT_ACCEPTED_MESSAGE);
  }
  if (typeof paymentMethodId !== 'string' || paymentMethodId.trim() === '') {
    throw new AppError(400, MISSING_CARD_MESSAGE, 'paymentMethodId');
  }

  const rentalAmount = Number(reservation.totalPrice);
  const depositAmount = Number(reservation.item.deposit);

  const charge = await chargeAndHoldDeposit({
    paymentMethodId,
    amountToCharge: rentalAmount,
    depositToHold: depositAmount,
  });
  if (!charge.ok) {
    throw new AppError(402, charge.message, 'paymentMethodId');
  }

  const recorded = await recordPayment({
    reservationId: id,
    rentalAmount,
    depositAmount,
    gatewayReference: charge.reference,
  });
  if (!recorded) {
    throw new AppError(409, ALREADY_PAID_MESSAGE);
  }

  return toReservationDetail(await findReservationDetail(id));
}
