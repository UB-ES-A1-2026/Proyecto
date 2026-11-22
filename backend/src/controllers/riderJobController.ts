// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
// Trabajos del rider (US-10.01, #292). requireAuth garantiza que request.auth existe.
import type { RequestHandler } from 'express';
import * as riderJobService from '../services/riderJobService.js';

// GET /api/trabajos
export const listAvailableJobs: RequestHandler = async (request, response) => {
  const jobs = await riderJobService.listAvailableJobs(request.auth!.userId);

  response.status(200).json({ jobs });
};

// GET /api/trabajos/mios
export const listMyJobs: RequestHandler = async (request, response) => {
  const jobs = await riderJobService.listMyJobs(request.auth!.userId);

  response.status(200).json({ jobs });
};

// POST /api/trabajos/:id/aceptar, sin cuerpo.
export const acceptJob: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const job = await riderJobService.acceptJob(
    request.auth!.userId,
    request.params.id,
  );

  response.status(200).json({ job });
};
