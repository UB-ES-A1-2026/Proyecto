import { apiRequest } from './apiClient';

// Contrato propuesto para POST /api/reservas (#120). Pendiente de confirmar con backend.
export type RentalRequestInput = {
  itemId: string;
  startDate: string;
  endDate: string;
};

export type Rental = {
  id: string;
  itemId: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: 'pendiente';
};

export function requestRental(token: string, input: RentalRequestInput): Promise<Rental> {
  return apiRequest<Rental>('/reservas', { method: 'POST', body: input, token });
}
