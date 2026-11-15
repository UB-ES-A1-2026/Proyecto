// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import { reservationDetailInclude } from './detailIncludes.js';
import { prisma } from './prisma.js';

// De la más nueva a la más antigua; el id desempata las creadas en el mismo milisegundo.
const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'asc' }] as const;

// La valoración que ha escrito el propio usuario de cada alquiler (US-08.01, #295): como mucho
// una, por la clave única (reserva_id, autor_id).
function ownRating(userId: string) {
  return {
    where: { authorId: userId },
    select: { score: true, comment: true, createdAt: true },
  };
}

// Las solicitudes que ha hecho el usuario como arrendatario.
export function findReservationsByRenter(renterId: string) {
  return prisma.reservation.findMany({
    where: { renterId },
    orderBy: [...NEWEST_FIRST],
    include: { ...reservationDetailInclude, ratings: ownRating(renterId) },
  });
}

// Las solicitudes que han recibido los objetos del usuario.
export function findReservationsByItemOwner(ownerId: string) {
  return prisma.reservation.findMany({
    where: { item: { ownerId } },
    orderBy: [...NEWEST_FIRST],
    include: { ...reservationDetailInclude, ratings: ownRating(ownerId) },
  });
}
