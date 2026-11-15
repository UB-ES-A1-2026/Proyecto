import { Router } from 'express';
import { rateRental } from '../controllers/ratingController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// El arrendatario valora un alquiler finalizado (US-08.01, #295).
export const ratingRoutes = Router();

ratingRoutes.post('/reservas/:id/valoracion', requireAuth, rateRental);
