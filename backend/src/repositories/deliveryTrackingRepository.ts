// Seguimiento de la entrega (US-05.02, #288).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026
import { prisma } from './prisma.js';

// La reserva con su entrega y lo necesario para decidir quién puede verla y qué puede hacer:
// el arrendatario, el propietario del objeto y el rider de la entrega.
export function findReservationForTracking(reservationId: string) {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      status: true,
      renterId: true,
      deliveryMode: true,
      item: { select: { ownerId: true } },
      delivery: {
        select: {
          status: true,
          riderId: true,
          deliveryCode: true,
          codeAttempts: true,
          assignedAt: true,
          pickedUpAt: true,
          onTheWayAt: true,
          deliveredAt: true,
          returnedAt: true,
          rider: { select: { id: true, username: true } },
        },
      },
    },
  });
}
