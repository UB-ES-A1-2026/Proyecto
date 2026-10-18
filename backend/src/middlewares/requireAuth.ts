// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 18/10/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import { findValidSession } from '../services/sessionService.js';

const INVALID_SESSION_MESSAGE =
  'Sesión no válida o caducada. Inicia sesión de nuevo.';

// Protege las rutas privadas: exige «Authorization: Bearer <token>» de una sesión activa.
export const requireAuth: RequestHandler = async (request, _response, next) => {
  const [scheme, token] = request.get('authorization')?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, INVALID_SESSION_MESSAGE);
  }

  const session = await findValidSession(token);

  if (!session) {
    throw new AppError(401, INVALID_SESSION_MESSAGE);
  }

  request.auth = { userId: session.userId, sessionId: session.id };
  next();
};
