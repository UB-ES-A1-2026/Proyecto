// Abrir una incidencia (US-09.01, #456). :id es el de la reserva.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 28/11/2026
import type { RequestHandler } from 'express';
import * as incidentService from '../services/incidentService.js';

// POST /api/reservas/:id/incidencia. requireAuth garantiza que request.auth existe.
export const openIncident: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  response
    .status(201)
    .json(
      await incidentService.openIncident(
        request.auth!.userId,
        request.params.id,
        request.body,
      ),
    );
};
