// Generado con asistencia de IA (Claude)
import type { Request, RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as itemPauseService from '../services/itemPauseService.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un id que no es un UUID no puede existir: 404 igual que un objeto que no existe.
function readItemId(request: Request): string {
  const id = String(request.params.id);

  if (!UUID_PATTERN.test(id)) {
    throw new AppError(404, itemPauseService.ITEM_NOT_FOUND_MESSAGE);
  }

  return id;
}

// POST /api/objetos/:id/pausar (US-02.04, #112). requireAuth garantiza que request.auth existe.
export const pauseItem: RequestHandler = async (request, response) => {
  const item = await itemPauseService.pauseItem(
    readItemId(request),
    request.auth!.userId,
  );

  response.status(200).json(item);
};

// POST /api/objetos/:id/reanudar (US-02.04, #112).
export const resumeItem: RequestHandler = async (request, response) => {
  const item = await itemPauseService.resumeItem(
    readItemId(request),
    request.auth!.userId,
  );

  response.status(200).json(item);
};
