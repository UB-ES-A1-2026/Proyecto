// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import type { RequestHandler } from 'express';
import * as myReservationsService from '../services/myReservationsService.js';

// GET /api/usuarios/me/reservas (US-04.02, #123). requireAuth garantiza que request.auth existe.
export const getMyReservations: RequestHandler = async (request, response) => {
  const reservations = await myReservationsService.getMyReservations(
    request.auth!.userId,
  );

  response.status(200).json(reservations);
};
