import type { RequestHandler } from 'express';
import * as photoService from '../services/photoService.js';

// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026
export const requestUpload: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const upload = await photoService.requestPhotoUpload(
    request.auth!.userId,
    request.params.id,
    request.body,
  );

  response.status(201).json(upload);
};

export const confirmUpload: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const photo = await photoService.confirmPhotoUpload(
    request.auth!.userId,
    request.params.id,
    request.body,
  );

  response.status(201).json(photo);
};
