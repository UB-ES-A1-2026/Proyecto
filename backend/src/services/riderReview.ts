// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import type { RiderApplicationStatus } from '@prisma/client';
import type { ReviewedApplicationRow } from '../repositories/riderReviewRepository.js';

// Solicitud de rider tal como la ve el admin (US-11.03): la lista y las respuestas de aceptar
// y rechazar comparten esta forma.
export interface RiderApplicationReview {
  id: string;
  username: string;
  email: string;
  phone: string;
  zone: string;
  vehicle: ReviewedApplicationRow['vehicle'];
  days: ReviewedApplicationRow['days'];
  slots: ReviewedApplicationRow['slots'];
  createdAt: Date;
  status: RiderApplicationStatus;
  reviewedAt: Date | null;
  reviewedBy: { id: string; username: string } | null;
  rejectionReason: string | null;
}

export function toRiderApplicationReview(
  row: ReviewedApplicationRow,
): RiderApplicationReview {
  return {
    id: row.id,
    username: row.user.username,
    email: row.user.email,
    phone: row.phone,
    zone: row.zone,
    vehicle: row.vehicle,
    days: row.days,
    slots: row.slots,
    createdAt: row.createdAt,
    status: row.status,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy,
    rejectionReason: row.rejectionReason,
  };
}
