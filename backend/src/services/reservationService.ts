// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import type { ReservationStatus } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  findItemForReservation,
  findReservationConflict,
  isRentalReferenceUsed,
  hasOverlappingReservation,
  insertReservationIfAvailable,
  type InsertReservationResult,
} from '../repositories/reservationRepository.js';
import {
  authorize,
  getAuthorization,
  isValidPaymentIntentId,
  PaymentActionRequiredError,
  PaymentDeclinedError,
  PaymentGatewayError,
  PaymentNotFoundError,
  release,
  toCents,
} from './paymentGateway.js';
import { toReservationDetail, type ReservationDetail } from './reservation.js';

export const ITEM_NOT_FOUND_MESSAGE = 'No hemos encontrado este objeto.';
export const OWN_ITEM_MESSAGE = 'No puedes alquilar tu propio objeto.';
export const NOT_AVAILABLE_MESSAGE =
  'El objeto no está disponible en esas fechas.';
export const DUPLICATE_REQUEST_MESSAGE =
  'Ya tienes una solicitud pendiente para estas fechas.';
export const START_DATE_IN_PAST_MESSAGE =
  'La fecha de inicio no puede ser anterior a hoy.';
export const END_BEFORE_START_MESSAGE =
  'La fecha de fin no puede ser anterior a la fecha de inicio.';
export const PAYMENT_UNAVAILABLE_MESSAGE =
  'La pasarela de pago no responde. Inténtalo de nuevo en unos minutos.';
export const INVALID_PAYMENT_INTENT_MESSAGE =
  'El pago de la verificación no es correcto.';
export const PAYMENT_MISMATCH_MESSAGE =
  'El pago no corresponde a esta solicitud. Vuelve a intentarlo.';
export const PAYMENT_NOT_COMPLETED_MESSAGE =
  'La verificación del pago no se ha completado. Vuelve a intentarlo.';
export const PAYMENT_NOT_FOUND_MESSAGE =
  'No encontramos ese pago. Vuelve a intentarlo.';
export const PAYMENT_ALREADY_USED_MESSAGE =
  'Este pago ya se ha usado en otra solicitud.';
export const RENTAL_TOO_LONG_MESSAGE =
  'El periodo es demasiado largo: revisa la fecha de fin.';

// Estas reservas ocupan las fechas. Las pendientes no: varias personas pueden solicitar las
// mismas fechas y decide el propietario (contrato en #120).
export const OCCUPYING_STATUSES: readonly ReservationStatus[] = [
  'accepted',
  'paid',
  'in_progress',
];

// Máximo que cabe en precio_total, DECIMAL(10,2).
const MAX_TOTAL_PRICE = 99_999_999.99;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Cuentan el primer y el último día: del 4 al 6 son 3 días.
export function countRentalDays(startDate: Date, endDate: Date): number {
  return (endDate.getTime() - startDate.getTime()) / MS_PER_DAY + 1;
}

// Fecha de hoy en España en formato «AAAA-MM-DD»: el servidor está en UTC y, entre las 00:00 y
// las 02:00 en España, en UTC todavía es ayer.
export function todayInSpain(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
  }).format(now);
}

function assertValidDates(
  input: { startDate: string; endDate: string },
  now: Date,
): void {
  // Las fechas son «AAAA-MM-DD»: se pueden comparar como texto.
  if (input.startDate < todayInSpain(now)) {
    throw new AppError(400, START_DATE_IN_PAST_MESSAGE, 'startDate');
  }

  if (input.endDate < input.startDate) {
    throw new AppError(400, END_BEFORE_START_MESSAGE, 'endDate');
  }
}

function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

// Comprueba si las fechas están libres antes de solicitar el alquiler (criterio 3 de US-04.01).
export async function checkAvailability(
  input: { itemId: string; startDate: string; endDate: string },
  now: Date = new Date(),
): Promise<{ available: boolean }> {
  assertValidDates(input, now);

  const item = await findItemForReservation(input.itemId);

  if (!item || item.status !== 'published') {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  const overlapping = await hasOverlappingReservation(
    input.itemId,
    toUtcDate(input.startDate),
    toUtcDate(input.endDate),
    OCCUPYING_STATUSES,
  );

  return { available: !overlapping };
}

// El propietario tiene 48 h para responder (#72); después la solicitud caduca (T10).
const RESPONSE_WINDOW_MS = 48 * 60 * 60 * 1000;
// Mínimo que Stripe puede retener: por debajo, el pago no tiene fianza.
const MIN_DEPOSIT_TO_HOLD = 0.5;

function conflictError(
  outcome: 'not_published' | 'duplicate' | 'overlapping',
): AppError {
  switch (outcome) {
    case 'not_published':
      return new AppError(404, ITEM_NOT_FOUND_MESSAGE);
    case 'duplicate':
      return new AppError(409, DUPLICATE_REQUEST_MESSAGE);
    case 'overlapping':
      return new AppError(409, NOT_AVAILABLE_MESSAGE, 'startDate');
  }
}

// Solicitar = pagar (US-07.01, #72): se bloquea el total en la tarjeta, sin cobrarlo, y la
// reserva queda pendiente con su pago «autorizado». El propietario lo cobra al aceptar (Alex).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 14/11/2026
export async function createReservation(
  renterId: string,
  input: {
    itemId: string;
    startDate: string;
    endDate: string;
    // Uno de los dos: el token del formulario de pago o, tras el 3D Secure, el PaymentIntent.
    confirmationTokenId?: string;
    paymentIntentId?: string;
  },
  now: Date = new Date(),
): Promise<ReservationDetail> {
  assertValidDates(input, now);

  const item = await findItemForReservation(input.itemId);

  if (!item || item.status !== 'published') {
    throw new AppError(404, ITEM_NOT_FOUND_MESSAGE);
  }

  if (item.ownerId === renterId) {
    throw new AppError(403, OWN_ITEM_MESSAGE);
  }

  const startDate = toUtcDate(input.startDate);
  const endDate = toUtcDate(input.endDate);
  const totalPrice = item.dailyPrice.times(countRentalDays(startDate, endDate));

  if (totalPrice.greaterThan(MAX_TOTAL_PRICE)) {
    throw new AppError(400, RENTAL_TOO_LONG_MESSAGE, 'endDate');
  }

  const reservationData = {
    itemId: input.itemId,
    renterId,
    startDate,
    endDate,
  };

  // Los 409 de siempre, antes de bloquear nada en la tarjeta.
  const conflict = await findReservationConflict(
    reservationData,
    OCCUPYING_STATUSES,
  );
  if (conflict) {
    throw conflictError(conflict);
  }

  // Se bloquea el total: alquiler + entrega (la entrega vale 0 hasta US-05.01).
  const amountCents = toCents(totalPrice);
  const metadata = {
    itemId: input.itemId,
    renterId,
    startDate: input.startDate,
    endDate: input.endDate,
  };
  const fromIntent = Boolean(input.paymentIntentId);
  let reference: string;
  if (input.paymentIntentId) {
    reference = await verifyAuthorizedIntent(
      input.paymentIntentId,
      amountCents,
      metadata,
    );
  } else {
    reference = await authorizeRental(
      amountCents,
      input.confirmationTokenId ?? '',
      metadata,
    );
  }

  // Si la reserva no se llega a guardar, se suelta el bloqueo: nunca queda dinero bloqueado
  // sin su reserva. Pero si otra petición con el mismo PaymentIntent ya creó su reserva (doble
  // envío, reintento o dos pestañas; solo en el segundo paso del 3D Secure), ese bloqueo es suyo: no se toca y se responde 409.
  let result: InsertReservationResult;
  try {
    result = await insertReservationIfAvailable(
      {
        ...reservationData,
        totalPrice,
        expiresAt: new Date(now.getTime() + RESPONSE_WINDOW_MS),
      },
      {
        rentalAmount: totalPrice,
        depositAmount: item.deposit,
        depositStatus: item.deposit.gte(MIN_DEPOSIT_TO_HOLD) ? 'pending' : null,
        rentalReference: reference,
      },
      OCCUPYING_STATUSES,
    );
  } catch (error) {
    if (fromIntent && (await isRentalReferenceUsed(reference))) {
      throw new AppError(409, PAYMENT_ALREADY_USED_MESSAGE, 'paymentIntentId');
    }
    await release(reference);
    throw error;
  }

  if (result.outcome !== 'created') {
    // Alguien se ha adelantado entre la comprobación y la reserva.
    if (fromIntent && (await isRentalReferenceUsed(reference))) {
      throw new AppError(409, PAYMENT_ALREADY_USED_MESSAGE, 'paymentIntentId');
    }
    await release(reference);
    throw conflictError(result.outcome);
  }

  return toReservationDetail(result.reservation);
}

// Primer paso: bloquea el importe con el token del formulario de pago.
async function authorizeRental(
  amountCents: number,
  confirmationTokenId: string,
  metadata: Record<string, string>,
): Promise<string> {
  try {
    const { reference } = await authorize(
      amountCents,
      confirmationTokenId,
      metadata,
    );
    return reference;
  } catch (error) {
    if (error instanceof PaymentDeclinedError) {
      throw new AppError(402, error.message, 'confirmationTokenId');
    }
    if (error instanceof PaymentActionRequiredError) {
      // El controlador lo convierte en la respuesta 402 con requiresAction.
      throw error;
    }
    throw gatewayFailure(error);
  }
}

// Segundo paso de 3D Secure: el PaymentIntent verificado en el navegador tiene que ser este mismo
// pago (importe, moneda y metadatos) y no estar usado. Si no coincide, se suelta el bloqueo.
async function verifyAuthorizedIntent(
  paymentIntentId: string,
  amountCents: number,
  metadata: Record<string, string>,
): Promise<string> {
  if (!isValidPaymentIntentId(paymentIntentId)) {
    throw new AppError(400, INVALID_PAYMENT_INTENT_MESSAGE, 'paymentIntentId');
  }

  let info;
  try {
    info = await getAuthorization(paymentIntentId);
  } catch (error) {
    if (error instanceof PaymentNotFoundError) {
      throw new AppError(409, PAYMENT_NOT_FOUND_MESSAGE, 'paymentIntentId');
    }
    throw gatewayFailure(error);
  }

  const matches =
    info.amountCents === amountCents &&
    info.currency === 'eur' &&
    Object.entries(metadata).every(
      ([key, value]) => info.metadata[key] === value,
    );

  // Si los metadatos no son del usuario, el intent no es suyo: no se toca.
  if (info.metadata.renterId !== metadata.renterId) {
    throw new AppError(409, PAYMENT_MISMATCH_MESSAGE, 'paymentIntentId');
  }

  if (await isRentalReferenceUsed(info.reference)) {
    throw new AppError(409, PAYMENT_ALREADY_USED_MESSAGE, 'paymentIntentId');
  }

  if (!matches) {
    await releaseQuietly(info.reference);
    throw new AppError(409, PAYMENT_MISMATCH_MESSAGE, 'paymentIntentId');
  }

  if (info.status !== 'requires_capture') {
    await releaseQuietly(info.reference);
    throw new AppError(409, PAYMENT_NOT_COMPLETED_MESSAGE, 'paymentIntentId');
  }

  return info.reference;
}

async function releaseQuietly(reference: string): Promise<void> {
  try {
    await release(reference);
  } catch (error) {
    console.error(
      'No se ha podido soltar el bloqueo:',
      error instanceof Error ? error.message : 'error desconocido',
    );
  }
}

function gatewayFailure(error: unknown): unknown {
  if (error instanceof PaymentGatewayError) {
    console.error('Fallo de la pasarela de pago:', error.message);
    return new AppError(502, PAYMENT_UNAVAILABLE_MESSAGE);
  }
  return error;
}
