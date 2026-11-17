// Generado con asistencia de IA (Claude)
import { apiRequest } from './apiClient';

// Contrato propuesto a T13 (#288) para el seguimiento de US-05.02 (#67). Si el backend cambia algo,
// solo hay que tocar este archivo: los componentes usan estos tipos y estas funciones.

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
  // «HH:MM-HH:MM», o null si es «Lo antes posible».
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

// Lo que puede marcar el rider, en orden.
export type RiderStep = 'picked_up' | 'on_the_way' | 'delivered';

function trackingPath(reservationId: string): string {
  return `/reservas/${encodeURIComponent(reservationId)}`;
}

export function getDeliveryTracking(
  token: string,
  reservationId: string,
): Promise<DeliveryTracking> {
  return apiRequest<DeliveryTracking>(`${trackingPath(reservationId)}/entrega`, { token });
}

// El rider avanza al estado siguiente; para «Entregada» hace falta el código del arrendatario.
export function advanceDelivery(
  token: string,
  reservationId: string,
  status: RiderStep,
  code?: string,
): Promise<DeliveryTracking> {
  return apiRequest<DeliveryTracking>(`${trackingPath(reservationId)}/entrega`, {
    method: 'PATCH',
    token,
    body: code === undefined ? { status } : { status, code },
  });
}

// Sin rider, el arrendatario marca «Ya tengo el objeto»: la entrega pasa a «Entregada».
export function confirmItemReceived(
  token: string,
  reservationId: string,
): Promise<DeliveryTracking> {
  return apiRequest<DeliveryTracking>(`${trackingPath(reservationId)}/entrega`, {
    method: 'PATCH',
    token,
    body: { status: 'delivered' },
  });
}

// «He devuelto el objeto»: el alquiler pasa de «En curso» a «Finalizada».
export function returnItem(token: string, reservationId: string): Promise<DeliveryTracking> {
  return apiRequest<DeliveryTracking>(`${trackingPath(reservationId)}/devolucion`, {
    method: 'POST',
    token,
  });
}
