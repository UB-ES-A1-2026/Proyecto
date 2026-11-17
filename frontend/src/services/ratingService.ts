// Generado con asistencia de IA (Claude)
import { apiRequest } from './apiClient';

export const COMMENT_MAX = 1000;

export type NewRating = {
  score: number;
  comment: string;
};

// Tipo de valoración (#339): «rental» cuando el arrendatario valora el alquiler (esta historia) y
// «user» cuando el propietario valora al arrendatario (US-08.02).
export type RatingType = 'rental' | 'user';

// Respuesta 201 de POST /api/reservas/:id/valoracion (#339).
export type PublishedRating = {
  id: string;
  reservationId: string;
  type: RatingType;
  score: number;
  comment: string | null;
  createdAt: string;
};

// Valorar un alquiler finalizado. El arrendatario valora el alquiler (US-08.01, #296) y el
// propietario valora al inquilino (US-08.02, #299), que manda `type: "user"` (#339). Errores: 400
// (field "score" o "comment"), 403, 404 y 409 (no finalizado o ya valorado).
export function rateReservation(
  token: string,
  reservationId: string,
  rating: NewRating,
  type: RatingType = 'rental',
): Promise<PublishedRating> {
  return apiRequest<PublishedRating>(`/reservas/${encodeURIComponent(reservationId)}/valoracion`, {
    method: 'POST',
    token,
    // La del alquiler se manda como en US-08.01, sin `type`: el backend la deduce por la sesión.
    body: type === 'user' ? { ...rating, type } : rating,
  });
}
