// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import type { RequestHandler } from 'express';
import { listNeighborhoods } from '../services/neighborhoods.js';

// GET /api/barrios (US-05.01, #281). Público: la lista fija de barrios de Barcelona.
export const getNeighborhoods: RequestHandler = (_request, response) => {
  response.status(200).json(listNeighborhoods());
};
