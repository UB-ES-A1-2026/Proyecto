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

// Respuesta de GET /api/objetos/:id (#109), también provisional. Los Decimal llegan como texto.
export type ItemDetail = {
  id: string;
  title: string;
  description: string;
  dailyPrice: string;
  deposit: string;
  status: ItemStatus;
};

// Cuerpo de PATCH /api/objetos/:id (#109): los campos que se pueden editar desde el formulario.
export type ItemChanges = {
  title: string;
  description: string;
  dailyPrice: number;
  deposit: number;
};

export function getMyItems(token: string): Promise<MyItem[]> {
  return apiRequest<MyItem[]>('/usuarios/me/objetos', { token });
}

export function getItem(token: string, id: string): Promise<ItemDetail> {
  return apiRequest<ItemDetail>(`/objetos/${encodeURIComponent(id)}`, { token });
}

export function updateItem(token: string, id: string, changes: ItemChanges): Promise<ItemDetail> {
  return apiRequest<ItemDetail>(`/objetos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: changes,
    token,
  });
}
