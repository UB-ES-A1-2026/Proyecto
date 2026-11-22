// Fianza (US-07.01, T10 #285): sin tarea programada, se retiene o se cobra al leer las
// reservas a partir del día antes del inicio. Hasta 6 días de alquiler se bloquea (retenida);
// más de 6 se cobra (cobrada). Liberarla o devolverla al finalizar es de T13.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import {
  findDepositReference,
  findPendingDeposits,
  saveDeposit,
} from '../repositories/depositRepository.js';
import {
  authorizeDeposit,
  refund,
  release,
  toCents,
} from './paymentGateway.js';
import { countRentalDays, todayInSpain } from './reservationService.js';

// Hasta estos días de alquiler la fianza se bloquea; con más, se cobra (un bloqueo caduca a ~7 días).
export const MAX_HOLD_RENTAL_DAYS = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// «AAAA-MM-DD» de mañana en España.
function tomorrowInSpain(now: Date): string {
  const today = new Date(`${todayInSpain(now)}T00:00:00.000Z`);
  return new Date(today.getTime() + MS_PER_DAY).toISOString().slice(0, 10);
}

// Suelta el bloqueo o devuelve el cobro de una fianza que no se ha podido guardar. Nunca lanza: si
// Stripe falla, un bloqueo caduca solo a los ~7 días; un cobro se queda registrado en el log.
async function undoDeposit(
  reference: string,
  collected: boolean,
): Promise<void> {
  try {
    await (collected ? refund(reference) : release(reference));
  } catch (error) {
    console.error(
      'No se ha podido deshacer una fianza que no se ha guardado:',
      error instanceof Error ? error.message : 'error desconocido',
    );
  }
}

// Retiene o cobra las fianzas pendientes de las reservas del usuario que empiezan mañana o antes.
// Es de mejor esfuerzo: si falla (tarjeta rechazada, Stripe caído), la fianza sigue pendiente y se
// reintenta en la siguiente lectura. Nunca lanza.
export async function settleDueDeposits(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const due = await findPendingDeposits(
      userId,
      new Date(`${tomorrowInSpain(now)}T00:00:00.000Z`),
    );

    for (const payment of due) {
      try {
        const days = countRentalDays(
          payment.reservation.startDate,
          payment.reservation.endDate,
        );
        const collect = days > MAX_HOLD_RENTAL_DAYS;
        const { reference } = await authorizeDeposit(
          payment.rentalReference!,
          toCents(payment.depositAmount),
          { capture: collect },
        );
        const saved = await saveDeposit(
          payment.id,
          reference,
          collect ? 'collected' : 'held',
        );
        // Otra lectura la guardó antes o la reserva se canceló mientras tanto (#365): lo que se
        // acaba de crear en Stripe no tendría referencia en la BD y nunca se liberaría. Pero con
        // Stripe, dos lecturas a la vez reciben el mismo PaymentIntent (clave de idempotencia):
        // si es el que ya está guardado, no se toca.
        if (!saved && (await findDepositReference(payment.id)) !== reference) {
          await undoDeposit(reference, collect);
        }
      } catch (error) {
        console.error(
          'No se ha podido retener la fianza:',
          error instanceof Error ? error.message : 'error desconocido',
        );
      }
    }
  } catch (error) {
    console.error(
      'No se han podido comprobar las fianzas:',
      error instanceof Error ? error.message : 'error desconocido',
    );
  }
}
