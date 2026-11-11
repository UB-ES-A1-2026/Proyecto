// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { Router } from 'express';
import { getNeighborhoods } from '../controllers/neighborhoodController.js';

export const neighborhoodRoutes = Router();

neighborhoodRoutes.get('/barrios', getNeighborhoods);
