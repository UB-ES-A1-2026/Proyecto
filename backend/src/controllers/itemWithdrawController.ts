// Generado con asistencia de IA (Claude)
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as itemWithdrawService from '../services/itemWithdrawService.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/objetos/:id/retirar (US-02.03, #110). requireAuth garantiza que request.auth existe.
export const withdrawItem: RequestHandler = async (request, response) => {
  const id = String(request.params.id);

  // Un id que no es un UUID no puede existir: 404 igual que un objeto que no existe.
  if (!UUID_PATTERN.test(id)) {
    throw new AppError(404, itemWithdrawService.ITEM_NOT_FOUND_MESSAGE);
  }

  const item = await itemWithdrawService.withdrawItem(id, request.auth!.userId);

  response.status(200).json(item);
};
