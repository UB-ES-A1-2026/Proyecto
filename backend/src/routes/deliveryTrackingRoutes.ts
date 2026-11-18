import { Router } from 'express';
import {
  advanceDelivery,
  getDeliveryTracking,
  confirmReceived,
  confirmReturned,
} from '../controllers/deliveryTrackingController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// Seguimiento de la entrega (US-05.02, #288). :id es el de la reserva, como en US-10.01.
export const deliveryTrackingRoutes = Router();

deliveryTrackingRoutes.get('/entregas/:id', requireAuth, getDeliveryTracking);
deliveryTrackingRoutes.post(
  '/entregas/:id/estado',
  requireAuth,
  advanceDelivery,
);
deliveryTrackingRoutes.post(
  '/entregas/:id/recibida',
  requireAuth,
  confirmReceived,
);
deliveryTrackingRoutes.post(
  '/entregas/:id/devuelta',
  requireAuth,
  confirmReturned,
);
