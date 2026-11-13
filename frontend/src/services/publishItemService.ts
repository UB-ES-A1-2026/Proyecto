import { apiRequest } from './apiClient';

export type NewItem = {
  title: string;
  description: string;
  categoryId: string;
  dailyPrice: number;
  deposit: number;
  neighborhood: string;
  homeDelivery: boolean;
  riderDelivery: boolean;
  pickupPointDelivery: boolean;
  // Solo con recogida en casa o rider (US-05.01, #307); con solo punto de recogida no se envía.
  address?: string;
  status: 'published' | 'paused';
};

export type CreatedItem = {
  id: string;
  title: string;
};

// Generado con asistencia de IA – revisado por Danyal, 03/11/2026
export function createItem(token: string, data: NewItem): Promise<CreatedItem> {
  return apiRequest<CreatedItem>('/objetos', {
    method: 'POST',
    token,
    body: data,
  });
}
