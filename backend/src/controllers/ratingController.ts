// Valorar un alquiler (US-08.01, #295).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 15/11/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as ratingService from '../services/ratingService.js';

const MAX_COMMENT_LENGTH = 1000;

export const MISSING_SCORE_MESSAGE = 'Elige una puntuación de 1 a 5 estrellas.';
export const INVALID_COMMENT_MESSAGE = `El comentario puede tener como máximo ${MAX_COMMENT_LENGTH} caracteres.`;

// Puntuación obligatoria (entero de 1 a 5) y comentario opcional. Un comentario vacío o solo
// con espacios se guarda como null.
function readRatingInput(source: unknown): {
  score: number;
  comment: string | null;
} {
  const { score, comment } = (source ?? {}) as Record<string, unknown>;

  if (
    typeof score !== 'number' ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 5
  ) {
    throw new AppError(400, MISSING_SCORE_MESSAGE, 'score');
  }

  if (comment === undefined || comment === null) {
    return { score, comment: null };
  }
  if (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH) {
    throw new AppError(400, INVALID_COMMENT_MESSAGE, 'comment');
  }

  const trimmed = comment.trim();
  return { score, comment: trimmed === '' ? null : trimmed };
}

// POST /api/reservas/:id/valoracion. requireAuth garantiza que request.auth existe.
export const rateRental: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const input = readRatingInput(request.body);
  const rating = await ratingService.rateRental(
    request.auth!.userId,
    request.params.id,
    input,
  );

  response.status(201).json(rating);
};
