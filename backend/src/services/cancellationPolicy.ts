// Reglas de la cancelación con penalización (US-04.05, #308 y #64): qué se puede cancelar, cuánto
// cuesta y qué hay que mover en la pasarela. Es una función pura: la usan a la vez la vista previa
// (GET) y la cancelación (POST), para que lo que se enseña antes de confirmar sea lo que se aplica.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026
import { Prisma } from '@prisma/client';
import type {
  DepositStatus,
  PaymentStatus,
  ReservationStatus,
} from '@prisma/client';
import { toCents } from './paymentGateway.js';
import { todayInSpain } from './reservationService.js';

export type CancelRole = 'renter' | 'owner';

export type PenaltyPercent = 0 | 35 | 100;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// El arrendatario cancela una pendiente, aceptada o pagada; el propietario, una aceptada o pagada
// (una pendiente la rechaza con «Rechazar»). Cualquier otro estado ya no se puede cancelar.
const CANCELLABLE_STATUSES: Record<CancelRole, readonly ReservationStatus[]> = {
  renter: ['pending', 'accepted', 'paid'],
  owner: ['accepted', 'paid'],
};

// Lo que hace falta leer de la reserva para decidir.
export interface CancellationSnapshot {
  status: ReservationStatus;
  startDate: Date;
  totalPrice: Prisma.Decimal;
  payment: {
    status: PaymentStatus;
    rentalAmount: Prisma.Decimal;
    deliveryAmount: Prisma.Decimal;
    depositStatus: DepositStatus | null;
    rentalReference: string | null;
    depositReference: string | null;
  } | null;
}

// Llamada a la pasarela que hay que hacer al cancelar. Los importes, en céntimos.
export type GatewayCall =
  | { action: 'release'; reference: string }
  | { action: 'refund'; reference: string; amountCents?: number };

export interface CancellationPlan {
  daysUntilStart: number;
  penaltyPercent: PenaltyPercent;
  penaltyAmount: Prisma.Decimal;
  // Lo que se devuelve al arrendatario.
  refundAmount: Prisma.Decimal;
  // Gratis y sin dinero que mover: pendiente (se libera el bloqueo) o aceptada sin pago.
  free: boolean;
  // Pendiente con el importe bloqueado: al cancelar se libera.
  releasesHold: boolean;
  // Cambios de estado del pago, solo los que hagan falta.
  paymentStatus?: PaymentStatus;
  depositStatus?: DepositStatus;
  // En el orden en que se ejecutan: lo que se puede repetir sin riesgo primero y el reembolso del
  // alquiler, lo último antes de confirmar.
  gatewayCalls: GatewayCall[];
}

// Días que faltan hasta la fecha de inicio, contados desde hoy con la fecha de España (el servidor
// está en UTC). Empezar hoy son 0; una fecha pasada da un número negativo.
export function daysUntilStart(
  startDate: Date,
  now: Date = new Date(),
): number {
  const today = new Date(`${todayInSpain(now)}T00:00:00.000Z`);
  return Math.round((startDate.getTime() - today.getTime()) / MS_PER_DAY);
}

// Tabla de #64: menos de 3 días, todo el alquiler; de 3 a 7, el 35 %; 8 o más, nada.
export function penaltyPercentFor(days: number): PenaltyPercent {
  if (days < 3) {
    return 100;
  }
  return days <= 7 ? 35 : 0;
}

// Importe de la penalización: el % del precio del alquiler (sin fianza ni entrega), a 2 decimales.
export function penaltyAmountFor(
  totalPrice: Prisma.Decimal,
  percent: PenaltyPercent,
): Prisma.Decimal {
  return totalPrice.times(percent).dividedBy(100).toDecimalPlaces(2);
}

export function canCancel(
  role: CancelRole,
  status: ReservationStatus,
): boolean {
  return CANCELLABLE_STATUSES[role].includes(status);
}

const ZERO = new Prisma.Decimal(0);

// Qué cuesta y qué mueve cancelar hoy desde la posición de `role`. null si ya no se puede cancelar.
export function planCancellation(
  role: CancelRole,
  reservation: CancellationSnapshot,
  now: Date = new Date(),
): CancellationPlan | null {
  if (!canCancel(role, reservation.status)) {
    return null;
  }

  const days = daysUntilStart(reservation.startDate, now);
  const { payment } = reservation;

  // Pendiente: gratis; el importe bloqueado se libera.
  if (reservation.status === 'pending') {
    const hold = payment?.status === 'authorized' ? payment : null;
    return {
      daysUntilStart: days,
      penaltyPercent: 0,
      penaltyAmount: ZERO,
      refundAmount: ZERO,
      free: true,
      releasesHold: hold !== null,
      paymentStatus: hold ? 'released' : undefined,
      gatewayCalls: hold?.rentalReference
        ? [{ action: 'release', reference: hold.rentalReference }]
        : [],
    };
  }

  // Aceptada del flujo anterior (sin pago): gratis y no hay nada que mover.
  if (!payment || payment.status !== 'paid') {
    return {
      daysUntilStart: days,
      penaltyPercent: 0,
      penaltyAmount: ZERO,
      refundAmount: ZERO,
      free: true,
      releasesHold: false,
      gatewayCalls: [],
    };
  }

  // Pagada. La penalización es solo sobre el alquiler; la entrega se devuelve siempre entera.
  const penaltyPercent = penaltyPercentFor(days);
  const penaltyAmount = penaltyAmountFor(
    reservation.totalPrice,
    penaltyPercent,
  );
  const paid = payment.rentalAmount.plus(payment.deliveryAmount);
  // Cancela el arrendatario: se le descuenta la penalización, que es para el propietario. Cancela
  // el propietario: se devuelve todo y la penalización solo queda registrada a su cargo.
  const refundAmount =
    role === 'renter'
      ? Prisma.Decimal.max(paid.minus(penaltyAmount), ZERO)
      : paid;

  const gatewayCalls: GatewayCall[] = [];
  let depositStatus: DepositStatus | undefined;
  switch (payment.depositStatus) {
    case 'held':
      // Retenida: se suelta el bloqueo.
      depositStatus = 'released';
      if (payment.depositReference) {
        gatewayCalls.push({
          action: 'release',
          reference: payment.depositReference,
        });
      }
      break;
    case 'collected':
      // Cobrada (alquileres largos): se devuelve.
      depositStatus = 'returned';
      if (payment.depositReference) {
        gatewayCalls.push({
          action: 'refund',
          reference: payment.depositReference,
        });
      }
      break;
    case 'pending':
      // Todavía no se había retenido: no hay nada que soltar.
      depositStatus = 'released';
      break;
    default:
      break;
  }

  const refunds = refundAmount.gt(0);
  if (refunds && payment.rentalReference) {
    gatewayCalls.push({
      action: 'refund',
      reference: payment.rentalReference,
      amountCents: toCents(refundAmount),
    });
  }

  return {
    daysUntilStart: days,
    penaltyPercent,
    penaltyAmount,
    refundAmount,
    free: false,
    releasesHold: false,
    // Reembolsado aunque sea en parte. Si no se devuelve nada (alquiler entero como penalización),
    // el pago sigue «pagado»: no se ha reembolsado nada.
    paymentStatus: refunds ? 'refunded' : undefined,
    depositStatus,
    gatewayCalls,
  };
}
