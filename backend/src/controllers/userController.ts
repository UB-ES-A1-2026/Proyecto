import type { RequestHandler } from 'express';
import * as userService from '../services/userService.js';

// Generado con asistencia de IA – revisado por Danyal, 19/10/2026
export const getProfile: RequestHandler = async (request, response) => {
  const profile = await userService.getProfile(request.auth!.userId);

  response.status(200).json(profile);
};
