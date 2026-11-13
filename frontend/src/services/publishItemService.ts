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
  // Reserva inmediata (US-07.01, #286): las solicitudes se aceptan solas y se cobran al momento.
  instantBooking: boolean;
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
