// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import type { ReservationStatus } from '@prisma/client';
import type { ReservationWithDetail } from '../repositories/detailIncludes.js';

// Representación de una reserva en la API: la devuelven POST /api/reservas (#120),
// GET /api/usuarios/me/reservas (#123) y aceptar/rechazar (#125). De las personas solo salen
// id y username, nunca el correo.

// Quién canceló la reserva, cuándo y con qué penalización (US-04.05, #308). Los importes, como
// texto con 2 decimales, igual que el resto de la API.
export interface CancellationDetail {
  by: { id: string; username: string };
  at: Date;
  penaltyPercent: number;
  penaltyAmount: string;
  refundAmount: string;
}

export interface ReservationDetail {
  id: string;
  item: { id: string; title: string };
  startDate: string;
  endDate: string;
  totalPrice: string;
  // Fianza del objeto y coste de la entrega (US-07.01, #72): para el desglose antes de pagar.
  deposit: string;
  deliveryAmount: string;
  status: ReservationStatus;
  // Hasta cuándo puede responder el propietario; null si ya no está pendiente.
  expiresAt: Date | null;
  renter: { id: string; username: string };
  owner: { id: string; username: string };
  createdAt: Date;
  // null salvo en las canceladas con su fila de cancelación.
  cancellation: CancellationDetail | null;
}

// «AAAA-MM-DD»: la columna es DATE y Prisma la devuelve como medianoche en UTC.
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toReservationDetail(
  reservation: ReservationWithDetail,
): ReservationDetail {
  return {
    id: reservation.id,
    item: { id: reservation.item.id, title: reservation.item.title },
    startDate: toIsoDate(reservation.startDate),
    endDate: toIsoDate(reservation.endDate),
    totalPrice: reservation.totalPrice.toFixed(2),
    deposit: reservation.item.deposit.toFixed(2),
    // Sin pago (reservas del flujo antiguo) o sin entrega todavía (US-05.01): 0.
    deliveryAmount: reservation.payment
      ? reservation.payment.deliveryAmount.toFixed(2)
      : '0.00',
    status: reservation.status,
    expiresAt: reservation.status === 'pending' ? reservation.expiresAt : null,
    renter: reservation.renter,
    owner: reservation.item.owner,
    createdAt: reservation.createdAt,
    cancellation:
      reservation.status === 'cancelled' && reservation.cancellation
        ? {
            by: reservation.cancellation.cancelledBy,
            at: reservation.cancellation.cancelledAt,
            penaltyPercent: reservation.cancellation.penaltyPercent,
            penaltyAmount: reservation.cancellation.penaltyAmount.toFixed(2),
            refundAmount: reservation.cancellation.refundAmount.toFixed(2),
          }
        : null,
  };
}
