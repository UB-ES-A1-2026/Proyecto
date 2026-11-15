// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import type { ReservationWithDetail } from '../repositories/detailIncludes.js';
import {
  findReservationsByItemOwner,
  findReservationsByRenter,
} from '../repositories/myReservationsRepository.js';
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

function toMyReservation(
  reservation: ReservationWithDetail & { ratings: OwnRating[] },
): MyReservation {
  return {
    ...toReservationDetail(reservation),
    myRating: reservation.ratings[0] ?? null,
  };
}

// «Mis solicitudes» (US-04.02, #123): las que he hecho y las que han recibido mis objetos.
export async function getMyReservations(
  userId: string,
): Promise<MyReservations> {
  const [sent, received] = await Promise.all([
    findReservationsByRenter(userId),
    findReservationsByItemOwner(userId),
  ]);

  return {
    sent: sent.map(toMyReservation),
    received: received.map(toMyReservation),
  };
}
