// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import type { RiderApplicationStatus } from '@prisma/client';
import type { ReviewedApplicationRow } from '../repositories/riderReviewRepository.js';

// Solicitud de rider tal como la ve el admin (US-11.03): la lista y las respuestas de aceptar
// y rechazar comparten esta forma.
export interface RiderApplicationReview {
  id: string;
  user: { id: string; username: string; email: string };
  phone: string;
  zone: string;
  vehicle: ReviewedApplicationRow['vehicle'];
  days: ReviewedApplicationRow['days'];
  slots: ReviewedApplicationRow['slots'];
  createdAt: Date;
  // Cuándo aceptó las condiciones en el cuestionario (US-10.03).
  termsAcceptedAt: Date;
  status: RiderApplicationStatus;
  reviewedAt: Date | null;
  reviewedBy: { id: string; username: string } | null;
  rejectionReason: string | null;
  // Entregas hechas por el rider: las que ha dejado en «Entregada» (bug #430).
  deliveriesCount: number;
}

export function toRiderApplicationReview(
  row: ReviewedApplicationRow,
): RiderApplicationReview {
  return {
    id: row.id,
    user: {
      id: row.user.id,
      username: row.user.username,
      email: row.user.email,
    },
    phone: row.phone,
    zone: row.zone,
    vehicle: row.vehicle,
    days: row.days,
    slots: row.slots,
    createdAt: row.createdAt,
    termsAcceptedAt: row.termsAcceptedAt,
    status: row.status,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy,
    rejectionReason: row.rejectionReason,
    deliveriesCount: row.user._count.deliveries,
  };
}
