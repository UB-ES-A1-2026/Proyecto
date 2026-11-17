// Caducidad al consultar (US-07.01, #72 y #343): no hay tarea programada; las solicitudes
// vencidas se caducan cuando alguien las lee o intenta aceptarlas.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026
import {
  expireOverdueForUser,
  type ExpiryLimits,
} from '../repositories/reservationExpiryRepository.js';
import { release } from './paymentGateway.js';
import { todayInSpain } from './reservationService.js';

export const EXPIRED_MESSAGE =
  'Esta solicitud ha caducado y ya no se puede aceptar.';

// «Hoy» es el de España: una solicitud que empieza hoy todavía no está vencida.
export function expiryLimits(now: Date = new Date()): ExpiryLimits {
  return { now, today: new Date(`${todayInSpain(now)}T00:00:00.000Z`) };
}

// Suelta los bloqueos sin hacer fallar la petición: si Stripe no responde, el bloqueo caduca solo.
// Solo se registra el mensaje del error, nunca la referencia ni cabeceras.
export async function releaseHoldsBestEffort(
  references: readonly string[],
): Promise<void> {
  for (const reference of references) {
    try {
      await release(reference);
    } catch (error) {
      console.error(
        'No se ha podido soltar un bloqueo de pago:',
        error instanceof Error ? error.message : 'error desconocido',
      );
    }
  }
}

// Caduca las solicitudes pendientes vencidas del usuario, como arrendatario o como propietario.
export async function expireOverdueReservations(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const references = await expireOverdueForUser(userId, expiryLimits(now));
  await releaseHoldsBestEffort(references);
}
