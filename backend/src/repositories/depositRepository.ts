// Pagos con la fianza pendiente de retener o cobrar (US-07.01, T10 #285).
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import { prisma } from './prisma.js';

// Pagos con la fianza «pendiente» de reservas pagadas del usuario (como arrendatario o propietario)
// que empiezan hasta la fecha dada (inclusive).
export function findPendingDeposits(userId: string, startsOnOrBefore: Date) {
  return prisma.payment.findMany({
    where: {
      depositStatus: 'pending',
      depositReference: null,
      rentalReference: { not: null },
      reservation: {
        status: { in: ['paid', 'in_progress'] },
        startDate: { lte: startsOnOrBefore },
        OR: [{ renterId: userId }, { item: { ownerId: userId } }],
      },
    },
    select: {
      id: true,
      depositAmount: true,
      rentalReference: true,
      reservation: { select: { startDate: true, endDate: true } },
    },
  });
}

// Guarda la referencia solo si nadie se ha adelantado (la fianza sigue pendiente).
export async function saveDeposit(
  paymentId: string,
  reference: string,
  status: 'held' | 'collected',
): Promise<boolean> {
  const { count } = await prisma.payment.updateMany({
    where: { id: paymentId, depositStatus: 'pending', depositReference: null },
    data: { depositReference: reference, depositStatus: status },
  });
  return count === 1;
}
