// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { apiRequest } from './apiClient';
import type { ReservationDelivery } from './deliveryService';

// «expired» (Caducada): el propietario no respondió a tiempo y se liberó el importe bloqueado
// (pago al solicitar, US-07.01 #286).
export type ReservationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'paid'
  | 'in_progress'
  | 'finished';

// Quién canceló una reserva, cuándo y con qué penalización (US-04.05, #309). Los importes llegan
// como texto porque Prisma serializa Decimal así.
export type Cancellation = {
  by: { id: string; username: string };
  at: string;
  penaltyPercent: number;
  penaltyAmount: string;
  refundAmount: string;
};

export type Reservation = {
  id: string;
  item: { id: string; title: string };
  startDate: string;
  endDate: string;
  totalPrice: string;
  // Pago al solicitar (US-07.01, #286). Opcionales hasta que el backend los envíe.
  // Fianza del objeto, como texto («15.00»).
  deposit?: string;
  // Coste de la entrega con rider (US-05.01). Mientras no venga, no hay entrega que pagar.
  deliveryAmount?: string;
  // Hasta cuándo puede responder el propietario a una solicitud pendiente (ISO).
  expiresAt?: string | null;
  status: ReservationStatus;
  renter: { id: string; username: string };
  owner: { id: string; username: string };
  createdAt: string;
  // Modo, hora y destino de la entrega (US-05.01, #282); null en las anteriores a la historia.
  delivery?: ReservationDelivery | null;
  // Valoración que la persona de la sesión ha hecho de esta reserva, o null si aún no la ha
  // valorado (US-08.01, #339).
  myRating: Rating | null;
  // Solo en las canceladas (US-04.05, #309). Opcional hasta que el backend (#308) lo envíe.
  cancellation?: Cancellation | null;
};

export type Rating = {
  score: number;
  comment: string | null;
  createdAt: string;
};

export type MyReservations = {
  sent: Reservation[];
  received: Reservation[];
};

export function getMyReservations(token: string): Promise<MyReservations> {
  return apiRequest<MyReservations>('/usuarios/me/reservas', { token });
}

// Lo que costaría cancelar hoy (GET /reservas/:id/cancelacion, contrato propuesto para #308).
// La penalización la calcula el backend, con la misma fecha de España con la que cancela.
export type CancellationPreview = {
  daysUntilStart: number;
  penaltyPercent: number;
  penaltyAmount: string;
  refundAmount: string;
  // Pendiente o aceptada sin pago: gratis.
  free: boolean;
  // Pendiente con el importe bloqueado: al cancelar se libera.
  releasesHold: boolean;
};

export function getCancellationPreview(token: string, id: string): Promise<CancellationPreview> {
  return apiRequest<CancellationPreview>(`/reservas/${encodeURIComponent(id)}/cancelacion`, {
    token,
  });
}

// Cancela la reserva (POST /reservas/:id/cancelar). Responde con la reserva «cancelled» y su
// `cancellation`. Errores: 403, 404, 409 (ya no se puede cancelar) y 502 (falló el reembolso: la
// reserva no cambia).
export function cancelReservation(token: string, id: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/reservas/${encodeURIComponent(id)}/cancelar`, {
    method: 'POST',
    token,
  });
}
