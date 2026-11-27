// Seguimiento de la entrega (US-05.02, #288). Contrato en el issue.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026
import type {
  DeliveryMode,
  DeliveryStatus,
  ReservationStatus,
} from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  findReservationForTracking,
  markDelivered,
  markReturned,
  moveDelivery,
  recordFailedCodeAttempt,
  renewDeliveryCode,
  type DepositToSettle,
} from '../repositories/deliveryTrackingRepository.js';
import { hasConfirmedStatePhotos } from '../repositories/statePhotoRepository.js';
import { generateDeliveryCode, MAX_CODE_ATTEMPTS } from './deliveryCode.js';
import { refund, release } from './paymentGateway.js';
import { publish } from './realtimeService.js';

export const NOT_FOUND_MESSAGE = 'No hemos encontrado esta entrega.';
export const NOT_PARTICIPANT_MESSAGE =
  'Solo las personas de esta reserva y su rider pueden ver la entrega.';
export const NOT_RIDER_MESSAGE =
  'Solo el rider de esta entrega puede cambiar su estado.';
export const NOT_PAID_MESSAGE =
  'La entrega empieza cuando la reserva está pagada.';
export const NOT_NEXT_STEP_MESSAGE =
  'La entrega no puede pasar a ese estado: los estados van en orden.';
export const CODE_LOCKED_MESSAGE = `El código se ha bloqueado tras ${MAX_CODE_ATTEMPTS} intentos fallidos.`;
export const NOT_RENTER_MESSAGE =
  'Solo el arrendatario puede marcar este paso.';
export const RIDER_DELIVERY_MESSAGE =
  'Con rider, la entrega la marca el rider con tu código.';
export const DEPOSIT_FAILED_MESSAGE =
  'No se ha podido liberar la fianza. Inténtalo de nuevo.';
export const NOT_IN_PROGRESS_MESSAGE =
  'Solo puedes marcar «He devuelto el objeto» con el alquiler en curso.';
export const NO_CODE_MESSAGE = 'Solo hay código de entrega con rider.';
export const ALREADY_DELIVERED_MESSAGE =
  'La entrega ya está hecha: el código ya no hace falta.';
// US-09.02 (#454): el objeto no sale de manos del propietario sin las fotos de su estado.
export const NO_STATE_PHOTOS_MESSAGE =
  'El propietario todavía no ha subido las fotos del estado.';

async function assertStatePhotosConfirmed(
  reservationId: string,
): Promise<void> {
  if (!(await hasConfirmedStatePhotos(reservationId, 'delivery'))) {
    throw new AppError(409, NO_STATE_PHOTOS_MESSAGE);
  }
}

// «El código no es correcto. Te quedan 3 intentos.»
export function wrongCodeMessage(attemptsLeft: number): string {
  if (attemptsLeft === 0) return CODE_LOCKED_MESSAGE;
  const attempts = attemptsLeft === 1 ? 'intento' : 'intentos';
  return `El código no es correcto. Te queda${attemptsLeft === 1 ? '' : 'n'} ${attemptsLeft} ${attempts}.`;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Los pasos de cada modo, en orden (#67). Con rider, «pending» es antes de que un rider acepte
// el trabajo (US-10.01) y no sale en el seguimiento.
const RIDER_STEPS: readonly DeliveryStatus[] = [
  'assigned',
  'picked_up',
  'on_the_way',
  'delivered',
];
const DIRECT_STEPS: readonly DeliveryStatus[] = ['pending', 'delivered'];

export type Viewer = 'renter' | 'owner' | 'rider';

export type DeliveryTracking = {
  reservationId: string;
  // Quién lo mira, para que el frontend sepa qué botones enseñar.
  role: Viewer;
  item: { id: string; title: string };
  startDate: string;
  endDate: string;
  reservationStatus: ReservationStatus;
  mode: DeliveryMode;
  // Con rider: «HH:MM-HH:MM» o «asap» (lo antes posible), como en US-05.01. Sin rider: null.
  slot: string | null;
  renter: { id: string; username: string };
  owner: { id: string; username: string };
  // Sin rider, dónde recoger el objeto. Solo al arrendatario.
  pickupAddress: string | null;
  status: DeliveryStatus;
  steps: { status: DeliveryStatus; at: Date | null }[];
  returnedAt: Date | null;
  rider: { id: string; username: string } | null;
  deliveryCode: string | null;
  // Si el propietario ya ha confirmado las fotos de la entrega (US-09.02, #454). Lo ven las tres
  // personas: sin ellas, ni «Ya tengo el objeto» ni la recogida del rider funcionan.
  deliveryPhotosConfirmed: boolean;
};

type TrackedReservation = NonNullable<
  Awaited<ReturnType<typeof findReservationForTracking>>
>;
type TrackedDelivery = NonNullable<TrackedReservation['delivery']>;

// Hora en que la entrega llegó a cada estado. «pending» no tiene: es el estado inicial.
function stepTime(delivery: TrackedDelivery, status: DeliveryStatus) {
  return {
    pending: null,
    assigned: delivery.assignedAt,
    picked_up: delivery.pickedUpAt,
    on_the_way: delivery.onTheWayAt,
    delivered: delivery.deliveredAt,
  }[status];
}

// La reserva con su entrega y quién la mira. 404 si no existe o no tiene entrega (las
// anteriores a US-05.01), y 403 si no es de la reserva ni su rider.
export async function loadTracking(userId: string, reservationId: string) {
  const reservation = UUID_PATTERN.test(reservationId)
    ? await findReservationForTracking(reservationId)
    : null;
  const { delivery } = reservation ?? {};
  if (!reservation || !delivery || !reservation.deliveryMode) {
    throw new AppError(404, NOT_FOUND_MESSAGE);
  }

  let viewer: Viewer;
  if (userId === reservation.renterId) viewer = 'renter';
  else if (userId === reservation.item.ownerId) viewer = 'owner';
  else if (delivery.riderId !== null && userId === delivery.riderId)
    viewer = 'rider';
  else throw new AppError(403, NOT_PARTICIPANT_MESSAGE);

  return { reservation, delivery, mode: reservation.deliveryMode, viewer };
}

// «AAAA-MM-DD»: las fechas de la reserva son DATE.
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toTracking(
  {
    reservation,
    delivery,
    mode,
    viewer,
  }: Awaited<ReturnType<typeof loadTracking>>,
  deliveryPhotosConfirmed: boolean,
): DeliveryTracking {
  const steps = mode === 'rider' ? RIDER_STEPS : DIRECT_STEPS;
  const isRenter = viewer === 'renter';
  // El código solo lo ve el arrendatario, con rider y mientras no se haya usado.
  const showsCode =
    isRenter && mode === 'rider' && delivery.status !== 'delivered';
  // La dirección del propietario o del punto solo la ve el arrendatario (como en US-05.01).
  let pickupAddress: string | null = null;
  if (isRenter && mode === 'home') {
    pickupAddress = reservation.item.address;
  } else if (isRenter && mode === 'pickup_point' && delivery.pickupPoint) {
    pickupAddress = `${delivery.pickupPoint.name}, ${delivery.pickupPoint.address}`;
  }

  return {
    reservationId: reservation.id,
    role: viewer,
    item: { id: reservation.item.id, title: reservation.item.title },
    startDate: toIsoDate(reservation.startDate),
    endDate: toIsoDate(reservation.endDate),
    reservationStatus: reservation.status,
    mode,
    slot: mode === 'rider' ? (delivery.slot ?? 'asap') : null,
    renter: reservation.renter,
    owner: reservation.item.owner,
    pickupAddress,
    status: delivery.status,
    steps: steps.map((status) => ({ status, at: stepTime(delivery, status) })),
    returnedAt: delivery.returnedAt,
    rider: delivery.rider,
    deliveryCode: showsCode ? delivery.deliveryCode : null,
    deliveryPhotosConfirmed,
  };
}

// GET /api/entregas/:id
export async function getDeliveryTracking(
  userId: string,
  reservationId: string,
): Promise<DeliveryTracking> {
  const loaded = await loadTracking(userId, reservationId);
  return toTracking(
    loaded,
    await hasConfirmedStatePhotos(reservationId, 'delivery'),
  );
}

// El estado siguiente de cada uno con rider (#67): no se puede saltar ni volver atrás.
const NEXT_RIDER_STEP: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  assigned: 'picked_up',
  picked_up: 'on_the_way',
  on_the_way: 'delivered',
};

// Avisa en tiempo real a las personas de la reserva y a su rider (US-05.02, #67: «sin recargar»).
// Va después de guardar el cambio y nunca lleva el código: el cliente vuelve a pedir el GET.
function notifyChange(
  loaded: Awaited<ReturnType<typeof loadTracking>>,
  status: DeliveryStatus | 'finished',
  at: Date,
): void {
  const { reservation, delivery } = loaded;
  const userIds = [reservation.renterId, reservation.item.ownerId];
  if (delivery.riderId) userIds.push(delivery.riderId);

  publish(userIds, 'entrega.estado', {
    reservationId: reservation.id,
    status,
    at: at.toISOString(),
  });
}

// POST /api/entregas/:id/estado: el rider pasa la entrega al estado que indica, que tiene que ser
// el siguiente. Para «delivered» introduce el código que le enseña el arrendatario.
export async function advanceDelivery(
  userId: string,
  reservationId: string,
  input: { status: 'picked_up' | 'on_the_way' | 'delivered'; code?: string },
  now = new Date(),
): Promise<DeliveryTracking> {
  const { status } = input;
  const loaded = await loadTracking(userId, reservationId);
  const { reservation, delivery, mode, viewer } = loaded;

  if (mode !== 'rider' || viewer !== 'rider') {
    throw new AppError(403, NOT_RIDER_MESSAGE);
  }
  if (reservation.status !== 'paid') {
    throw new AppError(409, NOT_PAID_MESSAGE);
  }
  if (NEXT_RIDER_STEP[delivery.status] !== status) {
    throw new AppError(409, NOT_NEXT_STEP_MESSAGE);
  }

  // El rider recoge el objeto del propietario: antes tienen que estar sus fotos (US-09.02).
  if (status === 'picked_up') {
    await assertStatePhotosConfirmed(reservationId);
  }

  let changed: boolean;
  if (status === 'delivered') {
    if (delivery.codeAttempts >= MAX_CODE_ATTEMPTS) {
      throw new AppError(409, CODE_LOCKED_MESSAGE, 'code');
    }
    if (input.code !== delivery.deliveryCode) {
      const counted = await recordFailedCodeAttempt(
        reservationId,
        MAX_CODE_ATTEMPTS,
      );
      if (!counted) throw new AppError(409, CODE_LOCKED_MESSAGE, 'code');
      const attemptsLeft = MAX_CODE_ATTEMPTS - delivery.codeAttempts - 1;
      throw new AppError(400, wrongCodeMessage(attemptsLeft), 'code');
    }
    changed = await markDelivered(reservationId, delivery.status, now);
  } else {
    changed = await moveDelivery(reservationId, delivery.status, status, now);
  }

  // Si otra petición se ha adelantado, la entrega ya no está en el estado que hemos leído.
  if (!changed) {
    throw new AppError(409, NOT_NEXT_STEP_MESSAGE);
  }
  notifyChange(loaded, status, now);
  return getDeliveryTracking(userId, reservationId);
}

// POST /api/entregas/:id/recibida: «Ya tengo el objeto». Con domicilio o punto de recogida, el
// arrendatario marca la entrega y la reserva pasa a «En curso» (#67).
export async function confirmReceived(
  userId: string,
  reservationId: string,
  now = new Date(),
): Promise<DeliveryTracking> {
  const loaded = await loadTracking(userId, reservationId);
  const { reservation, delivery, mode, viewer } = loaded;

  if (viewer !== 'renter') {
    throw new AppError(403, NOT_RENTER_MESSAGE);
  }
  if (mode === 'rider') {
    throw new AppError(409, RIDER_DELIVERY_MESSAGE);
  }
  if (reservation.status !== 'paid') {
    throw new AppError(409, NOT_PAID_MESSAGE);
  }
  if (delivery.status === 'pending') {
    await assertStatePhotosConfirmed(reservationId);
  }
  if (
    delivery.status !== 'pending' ||
    !(await markDelivered(reservationId, 'pending', now))
  ) {
    throw new AppError(409, NOT_NEXT_STEP_MESSAGE);
  }

  notifyChange(loaded, 'delivered', now);
  return getDeliveryTracking(userId, reservationId);
}

// Suelta o devuelve la fianza en Stripe al finalizar (#402). Si falla, 502 y la transacción se
// deshace: la reserva sigue «En curso» y el arrendatario puede volver a intentarlo.
async function settleDepositOrFail({
  reference,
  action,
}: DepositToSettle): Promise<void> {
  try {
    await (action === 'refund' ? refund(reference) : release(reference));
  } catch (error) {
    console.error(
      'La pasarela no ha podido liberar la fianza:',
      error instanceof Error ? error.message : 'error desconocido',
    );
    throw new AppError(502, DEPOSIT_FAILED_MESSAGE);
  }
}

// POST /api/entregas/:id/devuelta: «He devuelto el objeto». La reserva pasa a «Finalizada» y las
// dos personas ya pueden valorarla (US-08.01 y US-08.02).
export async function confirmReturned(
  userId: string,
  reservationId: string,
  now = new Date(),
): Promise<DeliveryTracking> {
  const loaded = await loadTracking(userId, reservationId);
  const { reservation, viewer } = loaded;

  if (viewer !== 'renter') {
    throw new AppError(403, NOT_RENTER_MESSAGE);
  }
  if (
    reservation.status !== 'in_progress' ||
    !(await markReturned(reservationId, now, settleDepositOrFail))
  ) {
    throw new AppError(409, NOT_IN_PROGRESS_MESSAGE);
  }

  notifyChange(loaded, 'finished', now);
  return getDeliveryTracking(userId, reservationId);
}

// POST /api/entregas/:id/codigo: el arrendatario genera un código nuevo, por ejemplo cuando se ha
// bloqueado tras 5 intentos. El anterior deja de valer y el rider vuelve a tener 5 intentos.
export async function renewCode(
  userId: string,
  reservationId: string,
  now = new Date(),
): Promise<DeliveryTracking> {
  const loaded = await loadTracking(userId, reservationId);
  const { reservation, delivery, mode, viewer } = loaded;

  if (viewer !== 'renter') {
    throw new AppError(403, NOT_RENTER_MESSAGE);
  }
  if (mode !== 'rider') {
    throw new AppError(409, NO_CODE_MESSAGE);
  }
  if (reservation.status !== 'paid') {
    throw new AppError(409, NOT_PAID_MESSAGE);
  }
  if (
    delivery.status === 'delivered' ||
    !(await renewDeliveryCode(reservationId, generateDeliveryCode()))
  ) {
    throw new AppError(409, ALREADY_DELIVERED_MESSAGE);
  }

  // El estado no cambia, pero el rider tiene que saber que puede volver a intentarlo.
  notifyChange(loaded, delivery.status, now);
  return getDeliveryTracking(userId, reservationId);
}
