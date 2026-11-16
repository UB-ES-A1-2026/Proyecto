// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { apiRequest } from './apiClient';

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
};

export type MyReservations = {
  sent: Reservation[];
  received: Reservation[];
};

export function getMyReservations(token: string): Promise<MyReservations> {
  return apiRequest<MyReservations>('/usuarios/me/reservas', { token });
}
