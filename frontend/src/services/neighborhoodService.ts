// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 13/11/2026
import { apiRequest } from './apiClient';

// GET /api/barrios (US-05.01, #281): los barrios de Barcelona, ya ordenados. Es público.
export function getNeighborhoods(): Promise<string[]> {
  return apiRequest<string[]>('/barrios');
}
