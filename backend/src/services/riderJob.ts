// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
// Cómo salen los trabajos del rider en la API (US-10.01, #292). Funciones puras.
import type { DeliveryStatus } from '@prisma/client';
import type { JobRecord } from '../repositories/riderJobRepository.js';
import { ASAP_SLOT } from './deliverySlots.js';

// Un trabajo disponible. Solo barrios: las direcciones se ven al aceptarlo (#78).
export interface AvailableJob {
  // El de la reserva, el mismo que usa el seguimiento (/entregas/:id, US-05.02).
  id: string;
  item: { id: string; title: string };
  startDate: string;
  // «asap» (lo antes posible) o «HH:MM-HH:MM», como en US-05.01.
  slot: string;
  // Lo que cobra el rider: la tarifa de entrega de la reserva («3.00», «5.00» o «7.00»).
  fee: string | null;
  pickupNeighborhood: string;
  deliveryNeighborhood: string | null;
}

// Un trabajo que el rider ya ha aceptado: aquí sí van las dos direcciones y el estado (US-05.02).
export interface MyJob extends AvailableJob {
  pickupAddress: string | null;
  deliveryAddress: string | null;
  status: DeliveryStatus;
}

// «AAAA-MM-DD»: la columna es DATE y Prisma la devuelve como medianoche en UTC.
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toAvailableJob(job: JobRecord): AvailableJob {
  const { delivery, item } = job;
  return {
    id: job.id,
    item: { id: item.id, title: item.title },
    startDate: toIsoDate(job.startDate),
    slot: delivery?.slot ?? ASAP_SLOT,
    fee: delivery?.fee?.toFixed(2) ?? null,
    pickupNeighborhood: item.neighborhood,
    deliveryNeighborhood: delivery?.deliveryNeighborhood ?? null,
  };
}

export function toMyJob(job: JobRecord): MyJob {
  return {
    ...toAvailableJob(job),
    pickupAddress: job.item.address,
    deliveryAddress: job.delivery?.deliveryAddress ?? null,
    status: job.delivery?.status ?? 'pending',
  };
}

// Por fecha de inicio; el mismo día, «Lo antes posible» primero y luego por franja. Las fechas
// «AAAA-MM-DD» y las franjas «HH:MM-HH:MM» se ordenan bien como texto. Con todo igual, por id, para
// que el orden sea siempre el mismo.
export function compareJobs(a: AvailableJob, b: AvailableJob): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  if (a.slot !== b.slot) {
    if (a.slot === ASAP_SLOT) return -1;
    if (b.slot === ASAP_SLOT) return 1;
    return a.slot < b.slot ? -1 : 1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
