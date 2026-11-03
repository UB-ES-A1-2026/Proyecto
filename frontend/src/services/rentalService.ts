import { apiRequest } from './apiClient';

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
};

// Lo que la pantalla de solicitud necesita de GET /api/objetos/:id (#119). La respuesta trae más
// campos; cuando feature/58 esté en develop se puede usar directamente getItemDetail (#15).
export type RentalItemDetail = {
  id: string;
  title: string;
  dailyPrice: string;
  status: 'published' | 'paused' | 'withdrawn';
  photos: { id: string; url: string }[];
};

export function getRentalItem(id: string, token: string): Promise<RentalItemDetail> {
  return apiRequest<RentalItemDetail>(`/objetos/${encodeURIComponent(id)}`, { token });
}

export function requestRental(token: string, input: RentalRequestInput): Promise<Reservation> {
  return apiRequest<Reservation>('/reservas', { method: 'POST', body: input, token });
}
