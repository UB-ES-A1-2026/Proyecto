// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import * as reservationService from '../services/reservationService.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const INVALID_ITEM_MESSAGE = 'El campo "objeto" no es correcto, revísalo.';
const INVALID_START_DATE_MESSAGE =
  'El campo "fecha de inicio" no es correcto, revísalo.';
const INVALID_END_DATE_MESSAGE =
  'El campo "fecha de fin" no es correcto, revísalo.';

// Acepta solo fechas reales en formato AAAA-MM-DD: rechaza, por ejemplo, 2026-02-30.
function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// El cuerpo de POST /reservas y la query de GET /reservas/disponibilidad llevan los mismos campos.
function readReservationInput(source: unknown): {
  itemId: string;
  startDate: string;
  endDate: string;
} {
  const { itemId, startDate, endDate } = (source ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof itemId !== 'string' || !UUID_PATTERN.test(itemId)) {
    throw new AppError(400, INVALID_ITEM_MESSAGE, 'itemId');
  }

  if (!isValidDate(startDate)) {
    throw new AppError(400, INVALID_START_DATE_MESSAGE, 'startDate');
  }

  if (!isValidDate(endDate)) {
    throw new AppError(400, INVALID_END_DATE_MESSAGE, 'endDate');
  }

  return { itemId, startDate, endDate };
}

// POST /api/reservas (US-04.01, #120). requireAuth garantiza que request.auth existe.
export const createReservation: RequestHandler = async (request, response) => {
  const input = readReservationInput(request.body);
  const reservation = await reservationService.createReservation(
    request.auth!.userId,
    input,
  );

  response.status(201).json(reservation);
};

// GET /api/reservas/disponibilidad (US-04.01, #120).
export const getAvailability: RequestHandler = async (request, response) => {
  const input = readReservationInput(request.query);
  const availability = await reservationService.checkAvailability(input);

  response.status(200).json(availability);
};
