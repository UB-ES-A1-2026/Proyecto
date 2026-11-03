// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import {
  findReservationsByItemOwner,
  findReservationsByRenter,
} from '../repositories/myReservationsRepository.js';
import { toReservationDetail, type ReservationDetail } from './reservation.js';

export interface MyReservations {
  sent: ReservationDetail[];
  received: ReservationDetail[];
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
    sent: sent.map(toReservationDetail),
    received: received.map(toReservationDetail),
  };
}
