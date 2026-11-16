// Generado con asistencia de IA (Claude)
// Trabajos de entrega del rider (US-10.01, #293). Contrato propuesto para el backend en #292.
import { apiRequest } from './apiClient';

// Un trabajo es una reserva pagada con entrega por rider. `id` es el de la reserva, el mismo que
// usa el seguimiento (/entregas/:id, US-05.02).
export type AvailableJob = {
  id: string;
  item: { id: string; title: string };
  startDate: string;
  // «asap» o «HH:MM-HH:MM», como en US-05.01.
  slot: string;
  // Lo que cobra el rider: la tarifa de entrega de la reserva, como texto («4.50»).
  fee: string;
  pickupNeighborhood: string;
  deliveryNeighborhood: string;
};

export type JobStatus = 'assigned' | 'picked_up' | 'on_the_way' | 'delivered';

// Una vez aceptado, con la dirección completa.
export type MyJob = AvailableJob & {
  pickupAddress: string;
  deliveryAddress: string;
  status: JobStatus;
};

export type AcceptJobsResult = {
  assigned: MyJob[];
  // Los que otro rider aceptó antes (criterio 4 de #78).
  alreadyTaken: { id: string; item: { id: string; title: string } }[];
};

export const ASAP_SLOT = 'asap';

export function getAvailableJobs(token: string): Promise<{ jobs: AvailableJob[] }> {
  return apiRequest<{ jobs: AvailableJob[] }>('/trabajos', { token });
}

export function getMyJobs(token: string): Promise<{ jobs: MyJob[] }> {
  return apiRequest<{ jobs: MyJob[] }>('/trabajos/mios', { token });
}

export function acceptJobs(token: string, ids: string[]): Promise<AcceptJobsResult> {
  return apiRequest<AcceptJobsResult>('/trabajos/aceptar', {
    method: 'POST',
    body: { ids },
    token,
  });
}
