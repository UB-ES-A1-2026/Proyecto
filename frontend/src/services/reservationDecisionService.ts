import { apiRequest } from './apiClient';
import type { ReservationStatus } from './reservationService';

// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
export type DecidedReservation = {
  id: string;
  status: ReservationStatus;
};

export function acceptReservation(token: string, id: string): Promise<DecidedReservation> {
  return apiRequest<DecidedReservation>(`/reservas/${encodeURIComponent(id)}/aceptar`, {
    method: 'POST',
    token,
  });
}

export function rejectReservation(token: string, id: string): Promise<DecidedReservation> {
  return apiRequest<DecidedReservation>(`/reservas/${encodeURIComponent(id)}/rechazar`, {
    method: 'POST',
    token,
  });
}
