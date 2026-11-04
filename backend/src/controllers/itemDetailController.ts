import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as itemDetailService from '../services/itemDetailService.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/objetos/:id (US-03.03, #119). Público; optionalAuth deja req.auth si hay sesión.
export const getItemDetail: RequestHandler = async (request, response) => {
  const id = String(request.params.id);

  // Un id que no es un UUID no puede existir: 404 igual que un objeto que no existe.
  if (!UUID_PATTERN.test(id)) {
    throw new AppError(404, itemDetailService.ITEM_NOT_FOUND_MESSAGE);
  }

  const item = await itemDetailService.getItemDetail(id, request.auth?.userId);

  response.status(200).json(item);
};
