// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 12/11/2026
import { prisma } from './prisma.js';

// Propietario y estado del objeto, para decidir si se puede ver su demanda.
export function findItemForDemand(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
    select: { ownerId: true, status: true },
  });
}

// Fechas de las solicitudes pendientes que tocan el rango [from, to].
// Solo devuelve las fechas, nunca quién las ha hecho (US-04.07).
// Nunca cuenta las del propio usuario.
export function findPendingRequestDates(
  itemId: string,
  from: Date,
  to: Date,
  viewerId: string,
) {
  return prisma.reservation.findMany({
    where: {
      itemId,
      status: 'pending',
      startDate: { lte: to },
      endDate: { gte: from },
      renterId: { not: viewerId },
    },
    select: { startDate: true, endDate: true },
  });
}
