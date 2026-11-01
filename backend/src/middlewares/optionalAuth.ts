// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 01/11/2026
import type { RequestHandler } from 'express';
import { findValidSession } from '../services/sessionService.js';

// Para rutas públicas que muestran algo más a quien tiene sesión (por ejemplo, la ficha de
// un objeto pausado a su propietario, #119). Si llega un «Bearer» de una sesión activa deja
// req.auth como requireAuth; si no llega o no es válido, sigue sin sesión, nunca responde 401.
// Valida el token solo con findValidSession: no hay otra forma de validar sesiones (AGENTS.md).
export const optionalAuth: RequestHandler = async (
  request,
  _response,
  next,
) => {
  const [scheme, token] = request.get('authorization')?.split(' ') ?? [];

  if (scheme === 'Bearer' && token) {
    const session = await findValidSession(token);
    if (session) {
      request.auth = { userId: session.userId, sessionId: session.id };
    }
  }

  next();
};
