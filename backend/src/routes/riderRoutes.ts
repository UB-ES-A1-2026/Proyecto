// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import { Router } from 'express';
import { registerRider } from '../controllers/riderController.js';

export const riderRoutes = Router();

// Pública: quien quiere ser rider todavía no tiene cuenta (US-10.03).
riderRoutes.post('/riders', registerRider);
