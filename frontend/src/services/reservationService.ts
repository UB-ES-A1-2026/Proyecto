// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { apiRequest } from './apiClient';

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
};

export type MyReservations = {
  sent: Reservation[];
  received: Reservation[];
};

export function getMyReservations(token: string): Promise<MyReservations> {
  return apiRequest<MyReservations>('/usuarios/me/reservas', { token });
}
