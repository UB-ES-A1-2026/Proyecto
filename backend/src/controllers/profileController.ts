// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import type { RequestHandler } from 'express';
import * as profilePhotoService from '../services/profilePhotoService.js';
import * as profileService from '../services/profileService.js';

export const getPublicProfile: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const profile = await profileService.getPublicProfile(
    request.params.id,
    request.auth?.userId,
  );

  response.status(200).json(profile);
};

export const updateOwnProfile: RequestHandler = async (request, response) => {
  const profile = await profileService.updateOwnBio(
    request.auth!.userId,
    request.body,
  );

  response.status(200).json(profile);
};

export const requestPhotoUpload: RequestHandler = async (request, response) => {
  const upload = await profilePhotoService.requestProfilePhotoUpload(
    request.auth!.userId,
    request.body,
  );

  response.status(201).json(upload);
};

export const confirmPhoto: RequestHandler = async (request, response) => {
  const profile = await profilePhotoService.confirmProfilePhoto(
    request.auth!.userId,
    request.body,
  );

  response.status(200).json(profile);
};

export const removePhoto: RequestHandler = async (request, response) => {
  await profilePhotoService.removeProfilePhoto(request.auth!.userId);

  response.status(204).end();
};
