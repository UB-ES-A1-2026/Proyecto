// Generado con asistencia de IA (Claude)
import { apiRequest } from './apiClient';
import type { Reservation } from './reservationService';

// Paga una solicitud aceptada (US-07.01, #286; backend #284). Devuelve la reserva ya «Pagada».
// Errores: 400 y 402 con field "paymentMethodId" (sin tarjeta o tarjeta rechazada), 403, 404 y 409.
export function payReservation(
  token: string,
  id: string,
  paymentMethodId: string,
): Promise<Reservation> {
  return apiRequest<Reservation>(`/reservas/${encodeURIComponent(id)}/pago`, {
    method: 'POST',
    token,
    body: { paymentMethodId },
  });
}
