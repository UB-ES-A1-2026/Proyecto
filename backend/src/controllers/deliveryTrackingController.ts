// Seguimiento de la entrega (US-05.02, #288).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026
import type { RequestHandler } from 'express';
import * as deliveryTrackingService from '../services/deliveryTrackingService.js';

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
