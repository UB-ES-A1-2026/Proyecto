import { Router } from 'express';
import {
  createReservation,
  getAvailability,
} from '../controllers/reservationController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const reservationRoutes = Router();

reservationRoutes.post('/reservas', requireAuth, createReservation);
reservationRoutes.get('/reservas/disponibilidad', requireAuth, getAvailability);
