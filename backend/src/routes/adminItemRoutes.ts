// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026
import { Router } from 'express';
import { withdrawItemAsAdmin } from '../controllers/adminItemWithdrawController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// El admin retira objetos (US-11.03, #317). Que sea admin lo comprueba el servicio (assertAdmin).
export const adminItemRoutes = Router();

adminItemRoutes.post(
  '/admin/objetos/:id/retirar',
  requireAuth,
  withdrawItemAsAdmin,
);
