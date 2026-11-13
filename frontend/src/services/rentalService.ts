// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 04/11/2026
import { apiRequest } from './apiClient';
import type { Reservation } from './reservationService';

export type { Reservation, ReservationStatus } from './reservationService';

// Fechas de una solicitud: GET /reservas/disponibilidad (#204) y POST /reservas (#120).
// El importe no se envía: lo calcula el backend.
export type RentalRequestInput = {
  itemId: string;
  startDate: string;
  endDate: string;
};

// Respuesta de GET /api/reservas/disponibilidad (#204). Solo informa: POST /reservas lo vuelve a
// comprobar al crear la solicitud.
export type Availability = { available: boolean };

export function checkAvailability(token: string, input: RentalRequestInput): Promise<Availability> {
  const query = new URLSearchParams(input).toString();
  return apiRequest<Availability>(`/reservas/disponibilidad?${query}`, { token });
}

// Solicitar es pagar (US-07.01, #286): con la tarjeta se bloquea el importe y se cobra cuando el
// propietario acepta; con reserva inmediata se cobra al momento. Responde 201 con la reserva
// («pending» o «paid»), 402 si la tarjeta se rechaza (y no se crea la reserva) o los 409 de #120.
export function requestRental(
  token: string,
  input: RentalRequestInput,
  paymentMethodId: string,
): Promise<Reservation> {
  return apiRequest<Reservation>('/reservas', {
    method: 'POST',
    body: { ...input, paymentMethodId },
    token,
  });
}
