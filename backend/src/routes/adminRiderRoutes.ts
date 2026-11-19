// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { Router } from 'express';
import {
  acceptRiderApplication,
  listRiderApplications,
  rejectRiderApplication,
} from '../controllers/riderReviewController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// El admin revisa las solicitudes de rider (US-11.03, #317). Que sea admin lo comprueba el
// servicio (assertAdmin), no un middleware.
export const adminRiderRoutes = Router();

adminRiderRoutes.get('/admin/riders', requireAuth, listRiderApplications);
adminRiderRoutes.post(
  '/admin/riders/:id/aceptar',
  requireAuth,
  acceptRiderApplication,
);
adminRiderRoutes.post(
  '/admin/riders/:id/rechazar',
  requireAuth,
  rejectRiderApplication,
);
