import { Router } from 'express';
import { createReservation } from '../controllers/reservationController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const reservationRoutes = Router();

reservationRoutes.post('/reservas', requireAuth, createReservation);
