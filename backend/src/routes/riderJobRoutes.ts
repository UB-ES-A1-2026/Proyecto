// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
import { Router } from 'express';
import {
  acceptJob,
  listAvailableJobs,
  listMyJobs,
} from '../controllers/riderJobController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// Trabajos del rider (US-10.01, #292). :id es el de la reserva, como en /entregas/:id (US-05.02).
export const riderJobRoutes = Router();

riderJobRoutes.get('/trabajos', requireAuth, listAvailableJobs);
// Antes de cualquier ruta con «/trabajos/:id».
riderJobRoutes.get('/trabajos/mios', requireAuth, listMyJobs);
riderJobRoutes.post('/trabajos/:id/aceptar', requireAuth, acceptJob);
