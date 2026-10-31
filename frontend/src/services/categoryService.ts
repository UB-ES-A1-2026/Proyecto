import { apiRequest } from './apiClient';

// Respuesta de GET /api/categorias (contrato propuesto en #117).
export type Category = {
  id: string;
  name: string;
};

export function getCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/categorias');
}
