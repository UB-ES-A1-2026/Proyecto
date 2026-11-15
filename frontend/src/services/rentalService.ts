// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 04/11/2026
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

// Respuesta de GET /api/reservas/disponibilidad (#204). Solo informa: POST /reservas lo vuelve a
// comprobar al crear la solicitud.
export type Availability = { available: boolean };

export function checkAvailability(token: string, input: RentalRequestInput): Promise<Availability> {
  const query = new URLSearchParams(input).toString();
  return apiRequest<Availability>(`/reservas/disponibilidad?${query}`, { token });
}

// Provisional hasta la T11 (#286): el formulario de pago de Stripe dará un token de verdad. Mientras
// tanto se envía uno simulado, que la pasarela simulada del backend acepta (US-07.01, #72).
const SIMULATED_PAYMENT_TOKEN = 'ctoken_simulado';

export function requestRental(token: string, input: RentalRequestInput): Promise<Reservation> {
  return apiRequest<Reservation>('/reservas', {
    method: 'POST',
    body: { ...input, confirmationTokenId: SIMULATED_PAYMENT_TOKEN },
    token,
  });
}
