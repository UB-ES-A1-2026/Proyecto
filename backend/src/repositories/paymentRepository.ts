// Pagos (US-07.01, #284).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 11/11/2026
import { prisma } from './prisma.js';

// Lo que hace falta para decidir si se puede pagar: quién la pidió, el estado, el importe,
// la fianza del objeto y si ya tiene un pago.
export function findReservationForPayment(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    select: {
      renterId: true,
      status: true,
      totalPrice: true,
      item: { select: { deposit: true } },
      payment: { select: { id: true } },
    },
  });
}

// En una transacción: pasa la reserva a «pagada» solo si sigue «aceptada» y registra el pago.
// Si llegan dos pagos a la vez, solo uno cambia el estado; además, reserva_id es único en pago.
export function recordPayment(data: {
  reservationId: string;
  rentalAmount: number;
  depositAmount: number;
  gatewayReference: string;
}): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    const { count } = await transaction.reservation.updateMany({
      where: { id: data.reservationId, status: 'accepted' },
      data: { status: 'paid' },
    });
    if (count !== 1) {
      return false;
    }

    await transaction.payment.create({
      data: { ...data, status: 'paid', depositStatus: 'held' },
    });
    return true;
  });
}
