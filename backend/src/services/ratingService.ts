// Valorar un alquiler (US-08.01, #295). Contrato en el issue.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 15/11/2026
import type { RatingType } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  findReservationForRating,
  insertRating,
} from '../repositories/ratingRepository.js';

export const NOT_FOUND_MESSAGE = 'No hemos encontrado este alquiler.';
export const NOT_RENTER_MESSAGE =
  'Solo quien ha alquilado el objeto puede valorar este alquiler.';
export const NOT_FINISHED_MESSAGE =
  'Solo se puede valorar un alquiler finalizado.';
export const ALREADY_RATED_MESSAGE = 'Ya has valorado este alquiler.';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RatingDetail = {
  id: string;
  reservationId: string;
  type: RatingType;
  score: number;
  comment: string | null;
  createdAt: Date;
};

// El arrendatario valora un alquiler finalizado. La valoración va al propietario del objeto.
export async function rateRental(
  authorId: string,
  reservationId: string,
  input: { score: number; comment: string | null },
): Promise<RatingDetail> {
  const reservation = UUID_PATTERN.test(reservationId)
    ? await findReservationForRating(reservationId)
    : null;

  if (!reservation) {
    throw new AppError(404, NOT_FOUND_MESSAGE);
  }
  if (reservation.renterId !== authorId) {
    throw new AppError(403, NOT_RENTER_MESSAGE);
  }
  if (reservation.status !== 'finished') {
    throw new AppError(409, NOT_FINISHED_MESSAGE);
  }

  const rating = await insertRating({
    reservationId,
    authorId,
    ratedUserId: reservation.item.ownerId,
    type: 'rental',
    score: input.score,
    comment: input.comment,
  });
  if (!rating) {
    throw new AppError(409, ALREADY_RATED_MESSAGE);
  }

  return rating;
}
