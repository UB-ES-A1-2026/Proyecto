import { Router } from 'express';
import { payReservation } from '../controllers/paymentController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// El arrendatario paga una solicitud aceptada (US-07.01, #284).
export const paymentRoutes = Router();

paymentRoutes.post('/reservas/:id/pago', requireAuth, payReservation);
