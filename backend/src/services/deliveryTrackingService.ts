// Seguimiento de la entrega (US-05.02, #288). Contrato en el issue.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026
import type {
  DeliveryMode,
  DeliveryStatus,
  ReservationStatus,
} from '@prisma/client';
import { AppError } from '../errors/appError.js';
import { findReservationForTracking } from '../repositories/deliveryTrackingRepository.js';

export const NOT_FOUND_MESSAGE = 'No hemos encontrado esta entrega.';
export const NOT_PARTICIPANT_MESSAGE =
  'Solo las personas de esta reserva y su rider pueden ver la entrega.';

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
  reservationStatus: ReservationStatus;
  mode: DeliveryMode;
  status: DeliveryStatus;
  steps: { status: DeliveryStatus; at: Date | null }[];
  returnedAt: Date | null;
  rider: { id: string; username: string } | null;
  deliveryCode: string | null;
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

function toTracking({
  reservation,
  delivery,
  mode,
  viewer,
}: Awaited<ReturnType<typeof loadTracking>>): DeliveryTracking {
  const steps = mode === 'rider' ? RIDER_STEPS : DIRECT_STEPS;
  // El código solo lo ve el arrendatario, con rider y mientras no se haya usado.
  const showsCode =
    viewer === 'renter' && mode === 'rider' && delivery.status !== 'delivered';

  return {
    reservationId: reservation.id,
    reservationStatus: reservation.status,
    mode,
    status: delivery.status,
    steps: steps.map((status) => ({ status, at: stepTime(delivery, status) })),
    returnedAt: delivery.returnedAt,
    rider: delivery.rider,
    deliveryCode: showsCode ? delivery.deliveryCode : null,
  };
}

// GET /api/entregas/:id
export async function getDeliveryTracking(
  userId: string,
  reservationId: string,
): Promise<DeliveryTracking> {
  return toTracking(await loadTracking(userId, reservationId));
}
