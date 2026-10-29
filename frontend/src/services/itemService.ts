import { apiRequest } from './apiClient';

// Estados del objeto: enum ItemStatus del esquema de Prisma (#86).
export type ItemStatus = 'published' | 'paused' | 'withdrawn';

// Respuesta de GET /api/usuarios/me/objetos (#109). Contrato provisional hasta que
// exista el endpoint: dailyPrice llega como texto porque Prisma serializa Decimal así.
export type MyItem = {
  id: string;
  title: string;
  dailyPrice: string;
  neighborhood: string;
  status: ItemStatus;
};

export function getMyItems(token: string): Promise<MyItem[]> {
  return apiRequest<MyItem[]>('/usuarios/me/objetos', { token });
}
