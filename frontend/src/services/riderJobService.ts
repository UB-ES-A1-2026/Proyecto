// Generado con asistencia de IA (Claude)
// Trabajos de entrega del rider (US-10.01, #293). Contrato propuesto para el backend en #292.
import { apiRequest } from './apiClient';
import type { DeliveryStatus } from './deliveryTrackingService';

// Un trabajo es una reserva pagada con entrega por rider. `id` es el de la reserva, el mismo que
// usa el seguimiento (/entregas/:id, US-05.02).
export type AvailableJob = {
  id: string;
  item: { id: string; title: string };
  startDate: string;
  // «asap» o «HH:MM-HH:MM», como en US-05.01.
  slot: string;
  // Lo que cobra el rider: la tarifa de entrega de la reserva, por tramos («3.00», «5.00» o «7.00»).
  // null solo si la reserva no guardó la tarifa: entonces no se enseña.
  fee: string | null;
  pickupNeighborhood: string;
  deliveryNeighborhood: string | null;
};

// Estados de la entrega de US-05.02: los nombres de la API se confirman con T13 (#288).
// Los estados de la entrega del seguimiento (US-05.02): los mismos valores y textos.
export type JobStatus = DeliveryStatus;

// Una vez aceptado, con la dirección completa.
export type MyJob = AvailableJob & {
  pickupAddress: string | null;
  deliveryAddress: string | null;
  status: JobStatus;
};

export const ASAP_SLOT = 'asap';

export function getAvailableJobs(token: string): Promise<{ jobs: AvailableJob[] }> {
  return apiRequest<{ jobs: AvailableJob[] }>('/trabajos', { token });
}

export function getMyJobs(token: string): Promise<{ jobs: MyJob[] }> {
  return apiRequest<{ jobs: MyJob[] }>('/trabajos/mios', { token });
}

// Acepta un solo trabajo (decisión de Kai, 20/11). 409 si otro rider lo aceptó antes (criterio 4).
export function acceptJob(token: string, id: string): Promise<{ job: MyJob }> {
  return apiRequest<{ job: MyJob }>(`/trabajos/${encodeURIComponent(id)}/aceptar`, {
    method: 'POST',
    token,
  });
}
