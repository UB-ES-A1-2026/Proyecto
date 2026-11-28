// Abrir una incidencia como propietario (US-09.01, #76, tarea #456). Contrato en
// docs/modelo-datos.md. El propietario la abre desde «Mis solicitudes» → «Recibidas» con el alquiler
// en curso o en las 48 h siguientes a la devolución. Mientras está abierta, la fianza no se libera
// (depositService.releaseReturnedDeposits): la resuelve el admin en US-11.04.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 28/11/2026
import { Prisma, type IncidentStatus, type IncidentType } from '@prisma/client';
import { AppError } from '../errors/appError.js';
import {
  createIncident,
  DepositAlreadyReleased,
  findReservationForIncident,
} from '../repositories/incidentRepository.js';
import { RETURN_REVIEW_HOURS } from './depositService.js';

export const INCIDENT_TYPES: readonly IncidentType[] = [
  'damage',
  'late_return',
  'no_return',
];
export const MAX_DESCRIPTION = 2000;

export const TYPE_MESSAGE = 'Elige el tipo de incidencia.';
export const DESCRIPTION_MESSAGE =
  'El campo "descripción" no es correcto, revísalo.';
export const NOT_FOUND_MESSAGE = 'No hemos encontrado este alquiler.';
export const NOT_OWNER_MESSAGE =
  'Solo el propietario puede abrir una incidencia de este alquiler.';
export const OUT_OF_TIME_MESSAGE = `Solo se puede abrir una incidencia con el alquiler en curso o en las ${RETURN_REVIEW_HOURS} h siguientes a la devolución.`;
export const ALREADY_OPEN_MESSAGE = 'Este alquiler ya tiene una incidencia.';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MS_PER_HOUR = 60 * 60 * 1000;

export interface IncidentView {
  id: string;
  type: IncidentType;
  description: string;
  status: IncidentStatus;
  createdAt: Date;
}

// Si el alquiler está en el plazo para abrir una incidencia: en curso, o finalizado y devuelto hace
// menos de 48 h (las mismas 48 h en que la fianza sigue retenida).
export function isWithinIncidentWindow(
  reservation: { status: string; delivery: { returnedAt: Date | null } | null },
  now: Date,
): boolean {
  if (reservation.status === 'in_progress') return true;
  const returnedAt = reservation.delivery?.returnedAt;
  return (
    reservation.status === 'finished' &&
    returnedAt != null &&
    now.getTime() - returnedAt.getTime() < RETURN_REVIEW_HOURS * MS_PER_HOUR
  );
}

function validate(body: unknown): {
  type: IncidentType;
  description: string;
} {
  const { type, description } = (body ?? {}) as Record<string, unknown>;
  if (!(INCIDENT_TYPES as readonly unknown[]).includes(type)) {
    throw new AppError(400, TYPE_MESSAGE, 'type');
  }
  const text = typeof description === 'string' ? description.trim() : '';
  if (text.length === 0 || text.length > MAX_DESCRIPTION) {
    throw new AppError(400, DESCRIPTION_MESSAGE, 'description');
  }
  return { type: type as IncidentType, description: text };
}

// POST /api/reservas/:id/incidencia
export async function openIncident(
  userId: string,
  reservationId: string,
  body: unknown,
  now: Date = new Date(),
): Promise<IncidentView> {
  const reservation = UUID_PATTERN.test(reservationId)
    ? await findReservationForIncident(reservationId)
    : null;
  if (!reservation) {
    throw new AppError(404, NOT_FOUND_MESSAGE);
  }
  if (reservation.item.ownerId !== userId) {
    throw new AppError(403, NOT_OWNER_MESSAGE);
  }
  if (reservation.incident) {
    throw new AppError(409, ALREADY_OPEN_MESSAGE);
  }
  if (!isWithinIncidentWindow(reservation, now)) {
    throw new AppError(409, OUT_OF_TIME_MESSAGE);
  }
  const { type, description } = validate(body);

  try {
    const incident = await createIncident({
      reservationId,
      openedById: userId,
      type,
      description,
    });
    const { id, status, createdAt } = incident;
    return { id, type, description, status, createdAt };
  } catch (error) {
    // Dos incidencias a la vez: el índice único de reserva_id para a la segunda.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppError(409, ALREADY_OPEN_MESSAGE);
    }
    // La fianza se ha liberado justo antes (48 h cumplidas o «Ha vuelto en buen estado»).
    if (error instanceof DepositAlreadyReleased) {
      throw new AppError(409, OUT_OF_TIME_MESSAGE);
    }
    throw error;
  }
}
