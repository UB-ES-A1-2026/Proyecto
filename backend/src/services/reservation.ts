// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import type { ReservationStatus } from '@prisma/client';
import type { ReservationWithDetail } from '../repositories/detailIncludes.js';
import {
  buildDeliveryView,
  type DeliveryView,
  type DeliveryViewer,
} from './deliveryView.js';

// Representación de una reserva en la API: la devuelven POST /api/reservas (#120),
// GET /api/usuarios/me/reservas (#123) y aceptar/rechazar (#125). De las personas solo salen
// id y username, nunca el correo.

export interface ReservationDetail {
  id: string;
  item: { id: string; title: string };
  startDate: string;
  endDate: string;
  totalPrice: string;
  status: ReservationStatus;
  renter: { id: string; username: string };
  owner: { id: string; username: string };
  // null en las reservas anteriores a US-05.01 (#281), que no tienen modo de entrega.
  delivery: DeliveryView | null;
  createdAt: Date;
}

// «AAAA-MM-DD»: la columna es DATE y Prisma la devuelve como medianoche en UTC.
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// `viewer` es quien pide la reserva y decide qué direcciones de la entrega salen (US-05.01, #281).
export function toReservationDetail(
  reservation: ReservationWithDetail,
  viewer: DeliveryViewer,
): ReservationDetail {
  const { delivery } = reservation;

  return {
    id: reservation.id,
    item: { id: reservation.item.id, title: reservation.item.title },
    startDate: toIsoDate(reservation.startDate),
    endDate: toIsoDate(reservation.endDate),
    totalPrice: reservation.totalPrice.toFixed(2),
    status: reservation.status,
    renter: reservation.renter,
    owner: reservation.item.owner,
    delivery: buildDeliveryView({
      mode: reservation.deliveryMode,
      status: reservation.status,
      viewer,
      slot: delivery?.slot ?? null,
      pickupPoint: delivery?.pickupPoint
        ? {
            id: delivery.pickupPoint.id,
            name: delivery.pickupPoint.name,
            address: delivery.pickupPoint.address,
            neighborhood: delivery.pickupPoint.neighborhood,
          }
        : null,
      fee: delivery?.fee?.toFixed(2) ?? null,
      deliveryNeighborhood: delivery?.deliveryNeighborhood ?? null,
      deliveryAddress: delivery?.deliveryAddress ?? null,
      ownerAddress: reservation.item.address,
    }),
    createdAt: reservation.createdAt,
  };
}
