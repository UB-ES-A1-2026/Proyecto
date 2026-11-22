// Valorar un alquiler (US-08.01, #295). Contrato en el issue.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 15/11/2026
import type { RatingType } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  findRatingStats,
  findReservationForRating,
  insertRating,
} from '../repositories/ratingRepository.js';

export const NOT_FOUND_MESSAGE = 'No hemos encontrado este alquiler.';
export const NOT_PARTICIPANT_MESSAGE =
  'Solo quien ha participado en este alquiler puede valorarlo.';
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

// Una de las dos partes valora un alquiler finalizado: el arrendatario al propietario (T20) o
// el propietario al arrendatario (T23).
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
  // Quien valora decide el tipo: el arrendatario valora el alquiler (al propietario) y el
  // propietario valora al arrendatario (US-08.02, #298).
  const ownerId = reservation.item.ownerId;
  const isRenter = authorId === reservation.renterId;
  const isOwner = authorId === ownerId;
  if (!isRenter && !isOwner) {
    throw new AppError(403, NOT_PARTICIPANT_MESSAGE);
  }
  if (reservation.status !== 'finished') {
    throw new AppError(409, NOT_FINISHED_MESSAGE);
  }

  const rating = await insertRating({
    reservationId,
    authorId,
    ratedUserId: isRenter ? ownerId : reservation.renterId,
    type: isRenter ? 'rental' : 'user',
    score: input.score,
    comment: input.comment,
  });

  if (!rating) {
    throw new AppError(409, ALREADY_RATED_MESSAGE);
  }

  return rating;
}

export type UserRating = { average: number | null; count: number };

// Valoración media de un usuario, redondeada a un decimal (US-08.02, #298). Es el formato del
// perfil público (US-01.4): su getRating de profileService llamará a esta función.
export async function getUserRating(userId: string): Promise<UserRating> {
  const { average, count } = await findRatingStats(userId);

  return {
    average: average === null ? null : Math.round(average * 10) / 10,
    count,
  };
}
