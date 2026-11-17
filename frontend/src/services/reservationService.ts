// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { apiRequest } from './apiClient';
import type { ReservationDelivery } from './deliveryService';

export type ReservationStatus =
  'pending' | 'accepted' | 'rejected' | 'cancelled' | 'paid' | 'in_progress' | 'finished';

export type Reservation = {
  id: string;
  item: { id: string; title: string };
  startDate: string;
  endDate: string;
  totalPrice: string;
  status: ReservationStatus;
  renter: { id: string; username: string };
  owner: { id: string; username: string };
  createdAt: string;
  // Modo, hora y destino de la entrega (US-05.01, #282); null en las anteriores a la historia.
  delivery?: ReservationDelivery | null;
};

export type MyReservations = {
  sent: Reservation[];
  received: Reservation[];
};

export function getMyReservations(token: string): Promise<MyReservations> {
  return apiRequest<MyReservations>('/usuarios/me/reservas', { token });
}
