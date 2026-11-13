// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 12/11/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as itemDemandService from '../services/itemDemandService.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const INVALID_FROM_MESSAGE =
  'El campo "fecha inicial" no es correcto, revísalo.';
const INVALID_TO_MESSAGE = 'El campo "fecha final" no es correcto, revísalo.';

// Acepta solo fechas reales en formato AAAA-MM-DD: rechaza, por ejemplo, 2026-02-30.
function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// GET /api/objetos/:id/demanda?from=AAAA-MM-DD&to=AAAA-MM-DD (US-04.07, #311).
// Con sesión, como el calendario donde se usa: requireAuth garantiza que request.auth existe y
// así nunca se cuentan las solicitudes propias, tampoco con un token caducado.
export const getItemDemand: RequestHandler = async (request, response) => {
  const id = String(request.params.id);

  // Un id que no es un UUID no puede existir: 404 igual que un objeto que no existe.
  if (!UUID_PATTERN.test(id)) {
    throw new AppError(404, itemDemandService.ITEM_NOT_FOUND_MESSAGE);
  }

  const { from, to } = request.query;

  if (!isValidDate(from)) {
    throw new AppError(400, INVALID_FROM_MESSAGE, 'from');
  }

  if (!isValidDate(to)) {
    throw new AppError(400, INVALID_TO_MESSAGE, 'to');
  }

  const demand = await itemDemandService.getItemDemand(
    id,
    { from, to },
    request.auth!.userId,
  );

  response.status(200).json(demand);
};
