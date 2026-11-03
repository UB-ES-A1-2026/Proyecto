import type { RequestHandler } from 'express';
import * as reservationDecisionService from '../services/reservationDecisionService.js';

// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 02/11/2026
export const acceptReservation: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const reservation = await reservationDecisionService.acceptReservation(
    request.auth!.userId,
    request.params.id,
  );

  response.status(200).json(reservation);
};

export const rejectReservation: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const reservation = await reservationDecisionService.rejectReservation(
    request.auth!.userId,
    request.params.id,
  );

  response.status(200).json(reservation);
};
