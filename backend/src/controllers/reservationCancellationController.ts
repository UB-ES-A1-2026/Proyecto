// Cancelar una reserva con penalización (US-04.05, #308).
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026
import type { RequestHandler } from 'express';
import * as cancellationService from '../services/cancellationService.js';

export const getCancellationPreview: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const preview = await cancellationService.getCancellationPreview(
    request.auth!.userId,
    request.params.id,
  );

  response.status(200).json(preview);
};

export const cancelReservation: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const reservation = await cancellationService.cancelReservation(
    request.auth!.userId,
    request.params.id,
  );

  response.status(200).json(reservation);
};
