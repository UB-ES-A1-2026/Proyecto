import { Router } from 'express';
import { getMyReservations } from '../controllers/myReservationsController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const myReservationsRoutes = Router();

myReservationsRoutes.get(
  '/usuarios/me/reservas',
  requireAuth,
  getMyReservations,
);
