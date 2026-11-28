// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026
import { reservationDetailInclude } from './detailIncludes.js';
import { prisma } from './prisma.js';

// De la más nueva a la más antigua; el id desempata las creadas en el mismo milisegundo.
const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'asc' }] as const;

// Las valoraciones del alquiler (US-08.01 y US-08.02): como mucho dos, una de cada parte, por la
// clave única (reserva_id, autor_id). El service separa la propia de la recibida.
const RATINGS = {
  select: { authorId: true, score: true, comment: true, createdAt: true },
} as const;

// La incidencia del alquiler (US-09.01, #456) y el estado de la fianza, que se queda retenida
// mientras la incidencia está abierta.
const INCIDENT = {
  select: { id: true, type: true, status: true, createdAt: true },
} as const;
const PAYMENT = {
  select: { deliveryAmount: true, depositStatus: true },
} as const;

// Las solicitudes que ha hecho el usuario como arrendatario.
export function findReservationsByRenter(renterId: string) {
  return prisma.reservation.findMany({
    where: { renterId },
    orderBy: [...NEWEST_FIRST],
    include: {
      ...reservationDetailInclude,
      ratings: RATINGS,
      incident: INCIDENT,
      payment: PAYMENT,
    },
  });
}

// Las solicitudes que han recibido los objetos del usuario.
export function findReservationsByItemOwner(ownerId: string) {
  return prisma.reservation.findMany({
    where: { item: { ownerId } },
    orderBy: [...NEWEST_FIRST],
    include: {
      ...reservationDetailInclude,
      ratings: RATINGS,
      incident: INCIDENT,
      payment: PAYMENT,
    },
  });
}
