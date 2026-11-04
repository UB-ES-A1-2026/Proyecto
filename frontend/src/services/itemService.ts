// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { apiRequest } from './apiClient';

// Estados del objeto: enum ItemStatus del esquema de Prisma (#86).
export type ItemStatus = 'published' | 'paused' | 'withdrawn';

export type ItemDetail = {
  id: string;
  title: string;
  description: string;
  dailyPrice: string;
  deposit: string;
  status: ItemStatus;
  neighborhood: string;
  category: {
    id: string;
    name: string;
  };
  photos: {
    id: string;
    url: string;
  }[];
  homeDelivery: boolean;
  riderDelivery: boolean;
  pickupPointDelivery: boolean;
  owner: {
    id: string;
    username: string;
  };
  createdAt: string;
};

export function getItemDetail(id: string, token?: string): Promise<ItemDetail> {
  return apiRequest<ItemDetail>(`/objetos/${encodeURIComponent(id)}`, { token });
}

// Respuesta de GET /api/usuarios/me/objetos (#109). Contrato provisional hasta que
// exista el endpoint: dailyPrice llega como texto porque Prisma serializa Decimal así.
export type MyItem = {
  id: string;
  title: string;
  dailyPrice: string;
  neighborhood: string;
  status: ItemStatus;
  // URL de la primera foto. Pausar, reanudar y retirar no la devuelven.
  photo?: string | null;
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

// POST /api/objetos/:id/pausar y /reanudar (#112), sin cuerpo. Devuelven el objeto con la forma
// de la lista. Solo se pausa uno publicado y solo se reanuda uno pausado (si no, 409).
export function pauseItem(token: string, id: string): Promise<MyItem> {
  return apiRequest<MyItem>(`/objetos/${encodeURIComponent(id)}/pausar`, {
    method: 'POST',
    token,
  });
}

export function resumeItem(token: string, id: string): Promise<MyItem> {
  return apiRequest<MyItem>(`/objetos/${encodeURIComponent(id)}/reanudar`, {
    method: 'POST',
    token,
  });
}

// POST /api/objetos/:id/retirar (#110), sin cuerpo. Devuelve el objeto con la forma de la lista.
export function withdrawItem(token: string, id: string): Promise<MyItem> {
  return apiRequest<MyItem>(`/objetos/${encodeURIComponent(id)}/retirar`, {
    method: 'POST',
    token,
  });
}
