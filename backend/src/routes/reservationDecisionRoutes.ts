import { Router } from 'express';
import {
  acceptReservation,
  rejectReservation,
} from '../controllers/reservationDecisionController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// El propietario responde a una solicitud (US-04.03 y US-04.04, #125).
export const reservationDecisionRoutes = Router();

reservationDecisionRoutes.post(
  '/reservas/:id/aceptar',
  requireAuth,
  acceptReservation,
);
reservationDecisionRoutes.post(
  '/reservas/:id/rechazar',
  requireAuth,
  rejectReservation,
);
