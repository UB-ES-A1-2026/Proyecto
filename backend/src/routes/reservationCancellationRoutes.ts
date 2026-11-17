// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026
import { Router } from 'express';
import {
  cancelReservation,
  getCancellationPreview,
} from '../controllers/reservationCancellationController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// El arrendatario o el propietario cancelan una reserva (US-04.05, #308).
export const reservationCancellationRoutes = Router();

reservationCancellationRoutes.get(
  '/reservas/:id/cancelacion',
  requireAuth,
  getCancellationPreview,
);
reservationCancellationRoutes.post(
  '/reservas/:id/cancelar',
  requireAuth,
  cancelReservation,
);
