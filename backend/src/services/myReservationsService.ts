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

// Una valoración de este alquiler tal como sale en «Mis solicitudes».
export interface RatingSummary {
  score: number;
  comment: string | null;
  createdAt: Date;
}

// myRating: la que ha escrito el usuario (US-08.01, #295). receivedRating: la que le ha puesto
// la otra parte (US-08.02, #298). null si aún no existe.
export type MyReservation = ReservationDetail & {
  myRating: RatingSummary | null;
  receivedRating: RatingSummary | null;
};

export interface MyReservations {
  sent: MyReservation[];
  received: MyReservation[];
}

type ReservationWithRatings = ReservationWithDetail & {
  ratings: (RatingSummary & { authorId: string })[];
};

// Sin authorId: quién la ha escrito ya se sabe por si es la propia o la recibida.
function toSummary(
  rating: (RatingSummary & { authorId: string }) | undefined,
): RatingSummary | null {
  if (!rating) return null;
  const { score, comment, createdAt } = rating;
  return { score, comment, createdAt };
}

// El rol decide qué dirección de entrega se ve (US-05.01): la del arrendatario o la del propietario.
function toMyReservation(
  userId: string,
  reservation: ReservationWithRatings,
  viewer: DeliveryViewer,
): MyReservation {
  const { ratings } = reservation;
  return {
    ...toReservationDetail(reservation, viewer),
    myRating: toSummary(ratings.find(({ authorId }) => authorId === userId)),
    receivedRating: toSummary(
      ratings.find(({ authorId }) => authorId !== userId),
    ),
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
    sent: sent.map((reservation) =>
      toMyReservation(userId, reservation, 'renter'),
    ),
    received: received.map((reservation) =>
      toMyReservation(userId, reservation, 'owner'),
    ),
  };
}
