// Generado con asistencia de IA (Claude)
import { apiRequest } from './apiClient';

export const COMMENT_MAX = 1000;

export type NewRating = {
  score: number;
  comment: string;
};

// Respuesta 201 de POST /api/reservas/:id/valoracion (contrato propuesto para #295).
export type PublishedRating = {
  id: string;
  reservationId: string;
  score: number;
  comment: string | null;
  author: { id: string; username: string };
  createdAt: string;
};

// Valorar un alquiler finalizado (US-08.01, #296). Quién valora a quién lo decide el backend por
// la sesión. Errores: 400 (field "score" o "comment"), 403, 404 y 409 (no finalizado o ya valorado).
export function rateReservation(
  token: string,
  reservationId: string,
  rating: NewRating,
): Promise<PublishedRating> {
  return apiRequest<PublishedRating>(`/reservas/${encodeURIComponent(reservationId)}/valoracion`, {
    method: 'POST',
    token,
    body: rating,
  });
}
