// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 04/11/2026
import { apiRequest } from './apiClient';
import type { DeliveryRequest, ReservationDelivery } from './deliveryService';

// Cuerpo de POST /api/reservas (#120). El importe no se envía: lo calcula el backend.
export type RentalRequestInput = {
  itemId: string;
  startDate: string;
  endDate: string;
};

export type ReservationStatus =
  'pending' | 'accepted' | 'rejected' | 'cancelled' | 'paid' | 'in_progress' | 'finished';

// Respuesta 201 de POST /api/reservas: la misma forma que en «Mis solicitudes» (#123, #124).
// totalPrice llega como texto porque Prisma serializa Decimal así.
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

// Respuesta de GET /api/reservas/disponibilidad (#204). Solo informa: POST /reservas lo vuelve a
// comprobar al crear la solicitud.
export type Availability = { available: boolean };

export function checkAvailability(token: string, input: RentalRequestInput): Promise<Availability> {
  const query = new URLSearchParams(input).toString();
  return apiRequest<Availability>(`/reservas/disponibilidad?${query}`, { token });
}

// Con US-05.01 (#282) la solicitud lleva también el modo de entrega y sus datos.
export function requestRental(
  token: string,
  input: RentalRequestInput & DeliveryRequest,
): Promise<Reservation> {
  return apiRequest<Reservation>('/reservas', { method: 'POST', body: input, token });
}
