import type { RequestHandler } from 'express';
import * as paymentService from '../services/paymentService.js';

// El arrendatario paga una solicitud aceptada (US-07.01, #284).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 11/11/2026
export const payReservation: RequestHandler<{ id: string }> = async (
  request,
  response,
) => {
  const body: unknown = request.body;
  const paymentMethodId =
    typeof body === 'object' && body !== null && 'paymentMethodId' in body
      ? body.paymentMethodId
      : undefined;

  const reservation = await paymentService.payReservation(
    request.auth!.userId,
    request.params.id,
    paymentMethodId,
  );

  response.status(200).json(reservation);
};
