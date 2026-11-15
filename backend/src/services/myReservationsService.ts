// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import type { ReservationWithDetail } from '../repositories/detailIncludes.js';
import {
  findReservationsByItemOwner,
  findReservationsByRenter,
} from '../repositories/myReservationsRepository.js';
import { settleDueDeposits } from './depositService.js';
import { expireOverdueReservations } from './reservationExpiry.js';
import type { DeliveryViewer } from './deliveryView.js';
import { toReservationDetail, type ReservationDetail } from './reservation.js';

// La valoración que ha escrito el usuario de este alquiler, o null si aún no la ha escrito
// (US-08.01, #295).
export interface OwnRating {
  score: number;
  comment: string | null;
  createdAt: Date;
}

export type MyReservation = ReservationDetail & { myRating: OwnRating | null };

export interface MyReservations {
  sent: MyReservation[];
  received: MyReservation[];
}

// El rol decide qué dirección de entrega se ve (US-05.01): la del arrendatario o la del propietario.
function toMyReservation(
  reservation: ReservationWithDetail & { ratings: OwnRating[] },
  viewer: DeliveryViewer,
): MyReservation {
  return {
    ...toReservationDetail(reservation, viewer),
    myRating: reservation.ratings[0] ?? null,
  };
}

// «Mis solicitudes» (US-04.02, #123): las que he hecho y las que han recibido mis objetos.
export async function getMyReservations(
  userId: string,
  now: Date = new Date(),
): Promise<MyReservations> {
  // Antes de leer, se caducan las solicitudes vencidas de este usuario (#343).
  await expireOverdueReservations(userId, now);
  // Fianza el día antes de empezar (T10, #285): de mejor esfuerzo, no hace fallar la lectura.
  await settleDueDeposits(userId);

  const [sent, received] = await Promise.all([
    findReservationsByRenter(userId),
    findReservationsByItemOwner(userId),
  ]);

  return {
    sent: sent.map((reservation) => toMyReservation(reservation, 'renter')),
    received: received.map((reservation) =>
      toMyReservation(reservation, 'owner'),
    ),
  };
}
