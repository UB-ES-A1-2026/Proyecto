// Caducidad de las solicitudes pendientes (US-07.01, #72 y #343): se caducan al consultarlas o
// al intentar aceptarlas, sin tarea programada.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

// Con qué se decide si una solicitud está vencida: el instante actual y hoy en España (a
// medianoche UTC, como Prisma guarda las columnas DATE).
export interface ExpiryLimits {
  now: Date;
  today: Date;
}

// Vencida = pasaron las 48 h para responder o la fecha de inicio ya es anterior a hoy.
export function overdueWhere(
  limits: ExpiryLimits,
): Prisma.ReservationWhereInput {
  return {
    OR: [
      { expiresAt: { lte: limits.now } },
      { startDate: { lt: limits.today } },
    ],
  };
}

// Lo contrario, para las transiciones condicionales: expiresAt null = fila antigua sin plazo.
export function notOverdueWhere(
  limits: ExpiryLimits,
): Prisma.ReservationWhereInput {
  return {
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: limits.now } }] },
      { startDate: { gte: limits.today } },
    ],
  };
}

export function isOverdue(
  reservation: { expiresAt: Date | null; startDate: Date },
  limits: ExpiryLimits,
): boolean {
  return (
    (reservation.expiresAt !== null &&
      reservation.expiresAt.getTime() <= limits.now.getTime()) ||
    reservation.startDate.getTime() < limits.today.getTime()
  );
}

// Referencias de pasarela que hay que soltar tras confirmar la transacción (las null son pagos
// sin pasarela).
export function nonNullReferences(
  references: readonly (string | null | undefined)[],
): string[] {
  return references.filter((reference): reference is string => !!reference);
}

// Pasa una solicitud pendiente a «caducada» y su pago a «liberado». Condicional: si otra petición
// la ha aceptado o rechazado a la vez, no hace nada. Devuelve la referencia del bloqueo que hay
// que soltar (null si no hay) o undefined si no ha caducado nada.
export async function expirePending(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<{ reference: string | null } | undefined> {
  const { count } = await transaction.reservation.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'expired' },
  });
  if (count !== 1) {
    return undefined;
  }

  const payment = await transaction.payment.findUnique({
    where: { reservationId: id },
    select: { status: true, rentalReference: true },
  });
  if (!payment) {
    return { reference: null };
  }

  await transaction.payment.updateMany({
    where: { reservationId: id, status: 'authorized' },
    data: { status: 'released' },
  });
  return { reference: payment.rentalReference };
}

// Caduca las solicitudes vencidas del usuario (las que ha hecho y las que han recibido sus
// objetos). Devuelve las referencias de bloqueo a soltar, ya confirmada la transacción.
export function expireOverdueForUser(
  userId: string,
  limits: ExpiryLimits,
): Promise<string[]> {
  return prisma.$transaction(async (transaction) => {
    const overdue = await transaction.reservation.findMany({
      where: {
        status: 'pending',
        AND: [
          overdueWhere(limits),
          { OR: [{ renterId: userId }, { item: { ownerId: userId } }] },
        ],
      },
      select: { id: true },
    });

    const references: (string | null)[] = [];
    for (const { id } of overdue) {
      const expired = await expirePending(transaction, id);
      if (expired) {
        references.push(expired.reference);
      }
    }

    return nonNullReferences(references);
  });
}
