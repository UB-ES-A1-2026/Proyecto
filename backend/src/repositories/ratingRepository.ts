// Valoraciones (US-08.01, #295).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 15/11/2026
import { Prisma, type RatingType } from '@prisma/client';
import { prisma } from './prisma.js';

// Lo que hace falta saber de un alquiler para decidir si se puede valorar.
export function findReservationForRating(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    select: {
      status: true,
      renterId: true,
      item: { select: { ownerId: true } },
    },
  });
}

// Guarda la valoración. Devuelve null si el autor ya había valorado este alquiler: lo impide la
// clave única (reserva_id, autor_id), así que también funciona con un doble clic.
export async function insertRating(data: {
  reservationId: string;
  authorId: string;
  ratedUserId: string;
  type: RatingType;
  score: number;
  comment: string | null;
}) {
  try {
    return await prisma.rating.create({
      data,
      select: {
        id: true,
        reservationId: true,
        type: true,
        score: true,
        comment: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return null;
    }
    throw error;
  }
}
