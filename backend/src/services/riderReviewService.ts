// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
// Revisión de las solicitudes de rider por un admin (US-11.03, #317). El contrato está en el issue.
import type { RiderApplicationStatus } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  findApplicationById,
  findApplicationsByStatus,
  resolveIfPending,
} from '../repositories/riderReviewRepository.js';
import { assertAdmin } from './adminService.js';
import {
  toRiderApplicationReview,
  type RiderApplicationReview,
} from './riderReview.js';

export const APPLICATION_NOT_FOUND_MESSAGE =
  'No hemos encontrado esta solicitud.';
export const ALREADY_REVIEWED_MESSAGE = 'Esta solicitud ya se ha revisado.';
export const INVALID_STATUS_MESSAGE =
  'El campo "estado" no es correcto, revísalo.';
export const INVALID_REASON_MESSAGE =
  'El campo "motivo" no es correcto, revísalo.';

export const REJECTION_REASON_MAX_LENGTH = 500;

// Valores del filtro ?estado= (la API habla en español; el enum, en inglés).
const STATUS_BY_FILTER: Record<string, RiderApplicationStatus> = {
  pendiente: 'pending',
  aceptada: 'approved',
  rechazada: 'rejected',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sin ?estado= devuelve todas (contrato de #317): el panel separa pendientes, aceptadas y rechazadas.
function parseStatusFilter(estado: unknown): RiderApplicationStatus | null {
  if (estado === undefined) return null;

  const status =
    typeof estado === 'string' && Object.hasOwn(STATUS_BY_FILTER, estado)
      ? STATUS_BY_FILTER[estado]
      : undefined;

  if (!status) {
    throw new AppError(400, INVALID_STATUS_MESSAGE, 'estado');
  }
  return status;
}

// Motivo opcional: se recorta y, si queda vacío, no hay motivo (null).
function parseRejectionReason(reason: unknown): string | null {
  if (reason === undefined || reason === null) return null;
  if (typeof reason !== 'string') {
    throw new AppError(400, INVALID_REASON_MESSAGE, 'reason');
  }

  const trimmed = reason.trim();
  if (trimmed.length > REJECTION_REASON_MAX_LENGTH) {
    throw new AppError(400, INVALID_REASON_MESSAGE, 'reason');
  }
  return trimmed === '' ? null : trimmed;
}

export async function listRiderApplications(
  adminId: string,
  estado: unknown,
): Promise<RiderApplicationReview[]> {
  await assertAdmin(adminId);
  const status = parseStatusFilter(estado);

  return (await findApplicationsByStatus(status)).map(toRiderApplicationReview);
}

async function resolveApplication(
  adminId: string,
  id: string,
  decision: { status: 'approved' | 'rejected'; rejectionReason: string | null },
): Promise<RiderApplicationReview> {
  if (!UUID_PATTERN.test(id)) {
    throw new AppError(404, APPLICATION_NOT_FOUND_MESSAGE);
  }

  const resolved = await resolveIfPending(id, {
    ...decision,
    reviewedById: adminId,
  });

  if (!resolved) {
    // No se actualizó nada: o no existe, o la resolvió otro antes (o a la vez).
    if (!(await findApplicationById(id))) {
      throw new AppError(404, APPLICATION_NOT_FOUND_MESSAGE);
    }
    throw new AppError(409, ALREADY_REVIEWED_MESSAGE);
  }

  const row = await findApplicationById(id);
  if (!row) throw new AppError(404, APPLICATION_NOT_FOUND_MESSAGE);
  return toRiderApplicationReview(row);
}

export async function acceptRiderApplication(
  adminId: string,
  id: string,
): Promise<RiderApplicationReview> {
  await assertAdmin(adminId);

  return resolveApplication(adminId, id, {
    status: 'approved',
    rejectionReason: null,
  });
}

export async function rejectRiderApplication(
  adminId: string,
  id: string,
  reason: unknown,
): Promise<RiderApplicationReview> {
  await assertAdmin(adminId);

  return resolveApplication(adminId, id, {
    status: 'rejected',
    rejectionReason: parseRejectionReason(reason),
  });
}
