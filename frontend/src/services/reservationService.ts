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
  // Valoración que la persona de la sesión ha hecho de esta reserva, o null si aún no la ha
  // valorado (US-08.01, #339).
  myRating: Rating | null;
  // Valoración que el propietario ha puesto al inquilino, para que la vea en «Enviadas» (US-08.02,
  // #299). Opcional: el backend todavía no la devuelve (T23, #298).
  receivedRating?: Rating | null;
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
