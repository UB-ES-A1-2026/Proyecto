// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import type {
  DepositStatus,
  IncidentStatus,
  IncidentType,
} from '@prisma/client';
import type { ReservationWithDetail } from '../repositories/detailIncludes.js';
import {
  findReservationsByItemOwner,
  findReservationsByRenter,
} from '../repositories/myReservationsRepository.js';
import {
  releaseReturnedDeposits,
  settleDueDeposits,
} from './depositService.js';
import { isWithinIncidentWindow } from './incidentService.js';
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
  // La incidencia del alquiler, o null (US-09.01, #456).
  incident: {
    id: string;
    type: IncidentType;
    status: IncidentStatus;
    createdAt: Date;
  } | null;
  // Si quien mira puede pulsar «Abrir incidencia» ahora: el propietario, sin incidencia, con el
  // alquiler en curso o devuelto hace menos de 48 h.
  canOpenIncident: boolean;
  // Estado de la fianza (null sin pago o sin fianza): «held» es «Retenida».
  depositStatus: DepositStatus | null;
};

export interface MyReservations {
  sent: MyReservation[];
  received: MyReservation[];
}

type ReservationWithRatings = ReservationWithDetail & {
  ratings: (RatingSummary & { authorId: string })[];
  incident: MyReservation['incident'];
  payment: { depositStatus: DepositStatus | null } | null;
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
  now: Date,
): MyReservation {
  const { ratings, incident } = reservation;
  return {
    ...toReservationDetail(reservation, viewer),
    myRating: toSummary(ratings.find(({ authorId }) => authorId === userId)),
    receivedRating: toSummary(
      ratings.find(({ authorId }) => authorId !== userId),
    ),
    incident,
    canOpenIncident:
      viewer === 'owner' &&
      incident === null &&
      isWithinIncidentWindow(reservation, now),
    depositStatus: reservation.payment?.depositStatus ?? null,
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
  // Y se libera la de las devueltas hace más de 48 h sin incidencia (US-09.01, #456).
  await releaseReturnedDeposits(userId, now);

  const [sent, received] = await Promise.all([
    findReservationsByRenter(userId),
    findReservationsByItemOwner(userId),
  ]);

  return {
    sent: sent.map((reservation) =>
      toMyReservation(userId, reservation, 'renter', now),
    ),
    received: received.map((reservation) =>
      toMyReservation(userId, reservation, 'owner', now),
    ),
  };
}
