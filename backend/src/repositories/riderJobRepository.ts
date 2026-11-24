// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 21/11/2026
// Trabajos del rider (US-10.01, #292): las reservas pagadas con entrega por rider que todavía no
// tiene ningún rider. Aceptar un trabajo es una sola sentencia condicional, para que dos riders
// nunca se lo lleven a la vez.
import type { Prisma, ReservationStatus } from '@prisma/client';
import { prisma } from './prisma.js';

// Lo que necesita cada trabajo: lo justo para la lista y, con las direcciones, «Mis trabajos».
const jobSelect = {
  id: true,
  status: true,
  renterId: true,
  deliveryMode: true,
  startDate: true,
  item: {
    select: {
      id: true,
      title: true,
      ownerId: true,
      neighborhood: true,
      address: true,
    },
  },
  delivery: {
    select: {
      status: true,
      slot: true,
      fee: true,
      deliveryNeighborhood: true,
      deliveryAddress: true,
      riderId: true,
    },
  },
} satisfies Prisma.ReservationSelect;

export type JobRecord = Prisma.ReservationGetPayload<{
  select: typeof jobSelect;
}>;

// Trabajos disponibles para el rider: pagados, por rider, sin rider, con la entrega pendiente y
// con inicio de hoy en adelante (`today` es «AAAA-MM-DD» en España). Nunca los suyos: ni los de
// sus objetos ni sus reservas.
export function findAvailableJobs(
  riderId: string,
  today: string,
): Promise<JobRecord[]> {
  return prisma.reservation.findMany({
    where: {
      status: 'paid',
      deliveryMode: 'rider',
      startDate: { gte: new Date(today) },
      renterId: { not: riderId },
      item: { ownerId: { not: riderId } },
      delivery: { riderId: null, status: 'pending' },
    },
    select: jobSelect,
  });
}

// Reservas cuyos trabajos sigue viendo el rider. Una cancelada desaparece de «Mis trabajos»: ya no
// hay entrega que hacer y el rider no debe seguir viendo las direcciones.
const RIDER_VISIBLE_STATUSES: ReservationStatus[] = [
  'paid',
  'in_progress',
  'finished',
];

// Los trabajos que ha aceptado el rider.
export function findJobsOfRider(riderId: string): Promise<JobRecord[]> {
  return prisma.reservation.findMany({
    where: {
      status: { in: RIDER_VISIBLE_STATUSES },
      delivery: { riderId },
    },
    select: jobSelect,
  });
}

export function findJob(reservationId: string): Promise<JobRecord | null> {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    select: jobSelect,
  });
}

// Asigna el trabajo al rider si sigue libre y disponible. Es un único UPDATE condicional: si dos
// riders lo intentan a la vez, PostgreSQL vuelve a comprobar `rider_id IS NULL` cuando el segundo
// obtiene el bloqueo de la fila y solo el primero cambia algo. Devuelve si lo ha conseguido.
export async function claimJob(
  reservationId: string,
  riderId: string,
  today: string,
  now: Date,
): Promise<boolean> {
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE entrega
    SET rider_id = ${riderId}::uuid, estado = 'asignada', asignada_en = ${now}
    WHERE reserva_id = ${reservationId}::uuid
      AND rider_id IS NULL
      AND estado = 'pendiente'
      AND EXISTS (
        SELECT 1
        FROM reserva
        WHERE reserva.id = entrega.reserva_id
          AND reserva.estado = 'pagada'
          AND reserva.modo_entrega = 'rider'
          AND reserva.fecha_inicio >= ${today}::date
        -- Bloquea la reserva hasta el final del UPDATE: una cancelación a la vez espera y ve el
        -- rider ya asignado, en lugar de cruzarse con la asignación.
        FOR SHARE
      )
    RETURNING id`;

  return claimed.length === 1;
}
