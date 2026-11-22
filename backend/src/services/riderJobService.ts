// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
// Trabajos del rider (US-10.01, #292). Contrato en el issue.
import { AppError } from '../errors/appError.js';
import {
  claimJob,
  findAvailableJobs,
  findJob,
  findJobsOfRider,
  type JobRecord,
} from '../repositories/riderJobRepository.js';
import { publish } from './realtimeService.js';
import { todayInSpain } from './reservationService.js';
import {
  compareJobs,
  toAvailableJob,
  toMyJob,
  type AvailableJob,
  type MyJob,
} from './riderJob.js';
import { isApprovedRider } from './riderService.js';

export const NOT_APPROVED_RIDER_MESSAGE =
  'Solo los riders aceptados pueden ver los trabajos.';
export const ALREADY_TAKEN_MESSAGE = 'Ya asignado a otro rider.';
export const JOB_NOT_FOUND_MESSAGE = 'No hemos encontrado este trabajo.';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Una reserva que nunca ha llegado a pagarse no ha sido nunca un trabajo.
const NEVER_A_JOB = new Set(['pending', 'accepted', 'rejected', 'expired']);

// Cualquier otra cuenta (normal, o rider pendiente o rechazado): 403.
async function assertApprovedRider(userId: string): Promise<void> {
  if (!(await isApprovedRider(userId))) {
    throw new AppError(403, NOT_APPROVED_RIDER_MESSAGE);
  }
}

// GET /api/trabajos: los mismos para todos los riders aceptados, salvo los suyos propios.
export async function listAvailableJobs(
  userId: string,
  now: Date = new Date(),
): Promise<AvailableJob[]> {
  await assertApprovedRider(userId);

  const jobs = await findAvailableJobs(userId, todayInSpain(now));
  return jobs.map(toAvailableJob).sort(compareJobs);
}

// GET /api/trabajos/mios: con las direcciones, porque el rider ya los ha aceptado.
export async function listMyJobs(userId: string): Promise<MyJob[]> {
  await assertApprovedRider(userId);

  const jobs = await findJobsOfRider(userId);
  return jobs.map(toMyJob).sort(compareJobs);
}

// 404 si no es un trabajo de rider: no existe, no va con rider, nunca se pagó o es del propio
// rider (su objeto o su reserva).
function isRiderJob(job: JobRecord | null, userId: string): job is JobRecord {
  return (
    job !== null &&
    job.deliveryMode === 'rider' &&
    job.delivery !== null &&
    !NEVER_A_JOB.has(job.status) &&
    job.renterId !== userId &&
    job.item.ownerId !== userId
  );
}

// Avisa en tiempo real a las personas de la reserva y al rider, con el mismo evento que el
// seguimiento (US-05.02). Es solo un aviso: si falla, el trabajo ya está aceptado.
function notifyAssigned(job: JobRecord, riderId: string, at: Date): void {
  try {
    publish([job.renterId, job.item.ownerId, riderId], 'entrega.estado', {
      reservationId: job.id,
      status: 'assigned',
      at: at.toISOString(),
    });
  } catch (error) {
    console.error('No se ha podido avisar de la asignación del rider', error);
  }
}

// POST /api/trabajos/:id/aceptar (:id es el de la reserva). Si otro rider se ha adelantado o el
// trabajo ya no está disponible (cancelado o ya empezado), 409.
export async function acceptJob(
  userId: string,
  reservationId: string,
  now: Date = new Date(),
): Promise<MyJob> {
  await assertApprovedRider(userId);

  const job = UUID_PATTERN.test(reservationId)
    ? await findJob(reservationId)
    : null;
  if (!isRiderJob(job, userId)) {
    throw new AppError(404, JOB_NOT_FOUND_MESSAGE);
  }

  const claimed = await claimJob(job.id, userId, todayInSpain(now), now);
  const current = await findJob(job.id);

  if (!claimed) {
    // Aceptarlo otra vez (un doble clic) no es un error: ya es suyo.
    if (current?.delivery?.riderId === userId) return toMyJob(current);
    throw new AppError(409, ALREADY_TAKEN_MESSAGE);
  }

  notifyAssigned(job, userId, now);
  return toMyJob(current ?? job);
}
