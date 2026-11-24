// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as itemDeliveryService from '../services/itemDeliveryService.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Un id que no es un UUID no puede existir: 404 igual que un objeto que no existe.
function readItemId(value: unknown): string {
  const id = String(value);

  if (!UUID_PATTERN.test(id)) {
    throw new AppError(404, itemDeliveryService.ITEM_NOT_FOUND_MESSAGE);
  }

  return id;
}

// Solo fechas reales en formato AAAA-MM-DD, como en las reservas.
function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// GET /api/objetos/:id/entrega?startDate=AAAA-MM-DD (US-05.01, #281). Público.
export const getDeliveryOptions: RequestHandler = async (request, response) => {
  const id = readItemId(request.params.id);
  const { startDate } = request.query;

  if (
    startDate !== undefined &&
    (typeof startDate !== 'string' || !isValidDate(startDate))
  ) {
    throw new AppError(
      400,
      'El campo "fecha de inicio" no es correcto, revísalo.',
      'startDate',
    );
  }

  const options = await itemDeliveryService.getDeliveryOptions(id, startDate);

  response.status(200).json(options);
};

// GET /api/objetos/:id/entrega/tarifa?barrio=<nombre> (US-05.01, #281). Público.
export const getRiderQuote: RequestHandler = async (request, response) => {
  const id = readItemId(request.params.id);
  const { barrio } = request.query;

  const quote = await itemDeliveryService.getRiderQuote(
    id,
    typeof barrio === 'string' ? barrio.trim() : '',
  );

  response.status(200).json(quote);
};
