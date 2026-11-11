// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import type { RequestHandler } from 'express';
import * as riderReviewService from '../services/riderReviewService.js';

export const listRiderApplications: RequestHandler = async (
  request,
  response,
) => {
  const applications = await riderReviewService.listRiderApplications(
    request.auth!.userId,
    request.query.estado,
  );

  response.status(200).json(applications);
};

export const acceptRiderApplication: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const application = await riderReviewService.acceptRiderApplication(
    request.auth!.userId,
    request.params.id,
  );

  response.status(200).json(application);
};

export const rejectRiderApplication: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const body: unknown = request.body;
  const reason =
    typeof body === 'object' && body !== null
      ? (body as { reason?: unknown }).reason
      : undefined;
  const application = await riderReviewService.rejectRiderApplication(
    request.auth!.userId,
    request.params.id,
    reason,
  );

  response.status(200).json(application);
};
