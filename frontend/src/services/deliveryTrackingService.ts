// Generado con asistencia de IA (Claude)
import { apiRequest } from './apiClient';

// Seguimiento de US-05.02 (#67) con la API de T13 (#288, Francesc). Los componentes usan
// DeliveryTracking; este archivo la saca de la respuesta de la API (ApiDeliveryTracking).

// Con rider: assigned → picked_up → on_the_way → delivered (pending mientras no hay rider).
// Sin rider (domicilio o punto de recogida): pending → delivered.
export type DeliveryStatus = 'pending' | 'assigned' | 'picked_up' | 'on_the_way' | 'delivered';

// Después de la entrega, la lista sigue con los estados del alquiler.
export type TrackingStep = DeliveryStatus | 'in_progress' | 'finished';

export type TrackingReservationStatus = 'paid' | 'in_progress' | 'finished';

export type DeliveryMode = 'rider' | 'home' | 'pickup_point';

// Quién mira el seguimiento: cada uno ve botones distintos.
export type TrackingRole = 'renter' | 'owner' | 'rider';

export type DeliveryTracking = {
  reservationId: string;
  role: TrackingRole;
  item: { id: string; title: string };
  startDate: string;
  endDate: string;
  reservationStatus: TrackingReservationStatus;
  mode: DeliveryMode;
  // «HH:MM-HH:MM», o null si es «Lo antes posible» o no hay rider.
  slot: string | null;
  renter: { username: string };
  owner: { username: string };
  // Sin rider, dónde se recoge el objeto. Solo lo recibe el arrendatario.
  pickupAddress: string | null;
  deliveryStatus: DeliveryStatus;
  // Los estados alcanzados, en orden, con su hora.
  history: { status: TrackingStep; at: string }[];
  // Solo para el arrendatario, con rider y antes de «Entregada».
  deliveryCode: string | null;
};

// Respuesta de la API de T13 (GET /api/entregas/:id y las acciones): `steps` son todos los pasos del
// modo, en orden, con su hora o null si aún no ha llegado.
export type ApiDeliveryTracking = {
  reservationId: string;
  role: TrackingRole;
  item: { id: string; title: string };
  startDate: string;
  endDate: string;
  reservationStatus: TrackingReservationStatus;
  mode: DeliveryMode;
  // «HH:MM-HH:MM» o «asap» con rider; null sin rider.
  slot: string | null;
  renter: { id: string; username: string };
  owner: { id: string; username: string };
  pickupAddress: string | null;
  status: DeliveryStatus;
  steps: { status: DeliveryStatus; at: string | null }[];
  returnedAt: string | null;
  rider: { id: string; username: string } | null;
  deliveryCode: string | null;
};

// De la respuesta de la API a lo que pinta la vista: los pasos alcanzados con su hora y, después
// de entregar, «En curso» (empieza al entregar) y «Finalizada» (al devolver).
export function toDeliveryTracking(api: ApiDeliveryTracking): DeliveryTracking {
  const history: DeliveryTracking['history'] = api.steps.flatMap(({ status, at }) =>
    at ? [{ status, at }] : [],
  );
  const deliveredAt = api.steps.find((step) => step.status === 'delivered')?.at ?? null;
  if (api.reservationStatus !== 'paid' && deliveredAt) {
    history.push({ status: 'in_progress', at: deliveredAt });
  }
  if (api.returnedAt) history.push({ status: 'finished', at: api.returnedAt });

  return {
    reservationId: api.reservationId,
    role: api.role,
    item: api.item,
    startDate: api.startDate,
    endDate: api.endDate,
    reservationStatus: api.reservationStatus,
    mode: api.mode,
    slot: api.slot === 'asap' ? null : api.slot,
    renter: { username: api.renter.username },
    owner: { username: api.owner.username },
    pickupAddress: api.pickupAddress,
    deliveryStatus: api.status,
    history,
    deliveryCode: api.deliveryCode,
  };
}

// Lo que puede marcar el rider, en orden.
export type RiderStep = 'picked_up' | 'on_the_way' | 'delivered';

function trackingPath(reservationId: string): string {
  return `/entregas/${encodeURIComponent(reservationId)}`;
}

async function trackingRequest(
  path: string,
  options: Parameters<typeof apiRequest>[1],
): Promise<DeliveryTracking> {
  return toDeliveryTracking(await apiRequest<ApiDeliveryTracking>(path, options));
}

// GET /api/entregas/:id (el id es el de la reserva). 403 si no es tuya y 404 si no existe.
export function getDeliveryTracking(
  token: string,
  reservationId: string,
): Promise<DeliveryTracking> {
  return trackingRequest(trackingPath(reservationId), { token });
}

// El rider avanza al estado siguiente; para «Entregada» hace falta el código del arrendatario
// (400 con field "code" si no es correcto, y se bloquea a los 5 intentos).
export function advanceDelivery(
  token: string,
  reservationId: string,
  status: RiderStep,
  code?: string,
): Promise<DeliveryTracking> {
  return trackingRequest(`${trackingPath(reservationId)}/estado`, {
    method: 'POST',
    token,
    body: code === undefined ? { status } : { status, code },
  });
}

// Sin rider, el arrendatario marca «Ya tengo el objeto»: la entrega pasa a «Entregada».
export function confirmItemReceived(
  token: string,
  reservationId: string,
): Promise<DeliveryTracking> {
  return trackingRequest(`${trackingPath(reservationId)}/recibida`, { method: 'POST', token });
}

// «He devuelto el objeto»: el alquiler pasa de «En curso» a «Finalizada».
export function returnItem(token: string, reservationId: string): Promise<DeliveryTracking> {
  return trackingRequest(`${trackingPath(reservationId)}/devuelta`, { method: 'POST', token });
}
