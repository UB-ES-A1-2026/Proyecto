import { Router } from 'express';
import { openIncident } from '../controllers/incidentController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

// Incidencias de un alquiler (US-09.01, #456). :id es el de la reserva.
export const incidentRoutes = Router();

incidentRoutes.post('/reservas/:id/incidencia', requireAuth, openIncident);
