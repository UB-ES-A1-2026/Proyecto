// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 03/11/2026
import type { RequestHandler } from 'express';
import { AppError } from '../errors/appError.js';
import { invalidFieldMessage } from '../services/itemService.js';
import { isKnownNeighborhood } from '../services/neighborhoods.js';
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

// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Modo y hora de entrega de la solicitud (US-05.01, #281). Aquí solo se comprueba la forma de los
// campos; que el objeto ofrezca el modo, que la franja no haya empezado o que el punto exista lo
// comprueba el service.
const DELIVERY_ADDRESS_MAX_LENGTH = 200;
const DELIVERY_MODES: readonly string[] = ['home', 'rider', 'pickup_point'];

function readDelivery(
  source: unknown,
): reservationService.ReservationDeliveryInput {
  const fields = (source ?? {}) as Record<string, unknown>;
  const { deliveryMode } = fields;

  if (
    typeof deliveryMode !== 'string' ||
    !DELIVERY_MODES.includes(deliveryMode)
  ) {
    throw new AppError(400, 'Elige un modo de entrega.', 'deliveryMode');
  }

  if (deliveryMode === 'home') {
    return { mode: 'home' };
  }

  if (deliveryMode === 'pickup_point') {
    const { pickupPointId } = fields;
    if (
      typeof pickupPointId !== 'string' ||
      !UUID_PATTERN.test(pickupPointId)
    ) {
      throw new AppError(400, 'Elige un punto de recogida.', 'pickupPointId');
    }
    return { mode: 'pickup_point', pickupPointId };
  }

  const { slot, deliveryAddress, deliveryNeighborhood } = fields;

  if (typeof slot !== 'string') {
    throw new AppError(400, reservationService.INVALID_SLOT_MESSAGE, 'slot');
  }

  const address =
    typeof deliveryAddress === 'string' ? deliveryAddress.trim() : '';
  if (address.length === 0 || address.length > DELIVERY_ADDRESS_MAX_LENGTH) {
    throw new AppError(
      400,
      invalidFieldMessage('dirección de entrega'),
      'deliveryAddress',
    );
  }

  const neighborhood =
    typeof deliveryNeighborhood === 'string' ? deliveryNeighborhood.trim() : '';
  if (!isKnownNeighborhood(neighborhood)) {
    throw new AppError(
      400,
      invalidFieldMessage('barrio de entrega'),
      'deliveryNeighborhood',
    );
  }

  return { mode: 'rider', slot, address, neighborhood };
}

// POST /api/reservas (US-04.01, #120). requireAuth garantiza que request.auth existe.
export const createReservation: RequestHandler = async (request, response) => {
  const input = {
    ...readReservationInput(request.body),
    delivery: readDelivery(request.body),
  };
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
