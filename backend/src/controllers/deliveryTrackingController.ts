// Seguimiento de la entrega (US-05.02, #288).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026
import type { RequestHandler } from 'express';
import * as deliveryTrackingService from '../services/deliveryTrackingService.js';
import { AppError } from '../errors/appError.js';

// GET /api/entregas/:id. requireAuth garantiza que request.auth existe.
export const getDeliveryTracking: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const tracking = await deliveryTrackingService.getDeliveryTracking(
    request.auth!.userId,
    request.params.id,
  );

  response.status(200).json(tracking);
};

export const INVALID_STATUS_MESSAGE =
  'El campo "estado" no es correcto, revísalo.';

// Los estados a los que el rider puede pasar la entrega. «delivered» llega en el paso siguiente.
const RIDER_STATUSES = ['picked_up', 'on_the_way'] as const;
type RiderStatus = (typeof RIDER_STATUSES)[number];

function isRiderStatus(value: unknown): value is RiderStatus {
  return (RIDER_STATUSES as readonly unknown[]).includes(value);
}

// POST /api/entregas/:id/estado
export const advanceDelivery: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const { status } = (request.body ?? {}) as Record<string, unknown>;
  if (!isRiderStatus(status)) {
    throw new AppError(400, INVALID_STATUS_MESSAGE, 'status');
  }

  const tracking = await deliveryTrackingService.advanceDelivery(
    request.auth!.userId,
    request.params.id,
    status,
  );

  response.status(200).json(tracking);
};
