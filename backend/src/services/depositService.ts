// Fianza (US-07.01, T10 #285): sin tarea programada, se retiene o se cobra al leer las
// reservas a partir del día antes del inicio. Hasta 6 días de alquiler se bloquea (retenida);
// más de 6 se cobra (cobrada). Al finalizar («He devuelto el objeto», US-05.02) se queda 48 h por si
// el propietario abre una incidencia (US-09.01, #456) y después se libera o se devuelve
// (releaseReturnedDeposits), también al leer las reservas.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import {
  findDepositReference,
  findPendingDeposits,
  findReturnedDepositsToRelease,
  saveDeposit,
} from '../repositories/depositRepository.js';
import {
  releaseDeposit,
  type DepositToSettle,
} from '../repositories/deliveryTrackingRepository.js';
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

// Horas que la fianza sigue retenida después de «He devuelto el objeto» (US-09.01, #456): el plazo
// del propietario para abrir una incidencia.
export const RETURN_REVIEW_HOURS = 48;
const MS_PER_HOUR = 60 * 60 * 1000;

// Suelta o devuelve la fianza en Stripe. Si falla, lanza: releaseDeposit deshace el cambio.
function settleInGateway({
  reference,
  action,
}: DepositToSettle): Promise<unknown> {
  return action === 'refund' ? refund(reference) : release(reference);
}

// Libera la fianza de una reserva finalizada sin incidencia abierta. Devuelve si la ha liberado.
// La usa también «Ha vuelto en buen estado» (US-09.05). Si Stripe falla, lanza.
export function releaseFinishedDeposit(
  reservationId: string,
): Promise<boolean> {
  return releaseDeposit(reservationId, async (deposit) => {
    await settleInGateway(deposit);
  });
}

// Libera las fianzas de las reservas del usuario devueltas hace más de 48 h sin incidencia abierta.
// Como settleDueDeposits, es de mejor esfuerzo: si Stripe falla, se reintenta en la siguiente
// lectura. Nunca lanza.
export async function releaseReturnedDeposits(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const returnedBefore = new Date(
      now.getTime() - RETURN_REVIEW_HOURS * MS_PER_HOUR,
    );
    for (const reservationId of await findReturnedDepositsToRelease(
      userId,
      returnedBefore,
    )) {
      try {
        await releaseFinishedDeposit(reservationId);
      } catch (error) {
        console.error(
          'No se ha podido liberar la fianza:',
          error instanceof Error ? error.message : 'error desconocido',
        );
      }
    }
  } catch (error) {
    console.error(
      'No se han podido comprobar las fianzas devueltas:',
      error instanceof Error ? error.message : 'error desconocido',
    );
  }
}
