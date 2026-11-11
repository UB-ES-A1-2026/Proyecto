// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
import { Router } from 'express';
import { streamEvents } from '../controllers/eventController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const eventRoutes = Router();

eventRoutes.get('/eventos/stream', requireAuth, streamEvents);
