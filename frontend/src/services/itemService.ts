// Generado con asistencia de IA – revisado por Danyal, 01/11/2026
import { apiRequest } from './apiClient';

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
