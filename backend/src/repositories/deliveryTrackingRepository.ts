// Seguimiento de la entrega (US-05.02, #288).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026
import { prisma } from './prisma.js';
import type { DeliveryStatus } from '@prisma/client';

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

// Hora de cada estado del rider antes de la entrega.
const RIDER_STEP_TIME = {
  picked_up: 'pickedUpAt',
  on_the_way: 'onTheWayAt',
} as const;

// Pasa la entrega de `from` a `to` y guarda la hora. Solo cambia si sigue en `from`: con un doble
// clic o dos peticiones a la vez, la segunda no encuentra la entrega en `from` y devuelve false.
export async function moveDelivery(
  reservationId: string,
  from: DeliveryStatus,
  to: keyof typeof RIDER_STEP_TIME,
  at: Date,
): Promise<boolean> {
  const { count } = await prisma.delivery.updateMany({
    where: { reservationId, status: from },
    data: { status: to, [RIDER_STEP_TIME[to]]: at },
  });
  return count === 1;
}
