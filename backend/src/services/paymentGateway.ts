// Pasarela de pago (US-07.01, #72). Simulada hasta T10 (#285), que la conecta a Stripe en modo de
// prueba con las mismas firmas: authorize bloquea un importe sin cobrarlo (PaymentIntent con
// capture_method: manual), capture lo cobra, release suelta el bloqueo y refund devuelve lo cobrado.
// Los importes van siempre en céntimos enteros. La fianza usa las mismas funciones con otra referencia.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 14/11/2026
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

// En la pasarela simulada, este token se rechaza como una tarjeta sin fondos; cualquier otro se acepta.
export const DECLINED_TEST_TOKEN = 'ctoken_declined';

export class PaymentDeclinedError extends Error {}

// Importe de la BD (DECIMAL(10,2)) a céntimos enteros, sin pasar por coma flotante.
export function toCents(amount: Prisma.Decimal): number {
  return amount.times(100).toDecimalPlaces(0).toNumber();
}

// Bloquea el importe en la tarjeta del usuario. Devuelve la referencia del bloqueo
// (el id del PaymentIntent en Stripe) o lanza PaymentDeclinedError si el banco lo rechaza.
export async function authorize(
  amountCents: number,
  confirmationTokenId: string,
  metadata: Record<string, string>,
): Promise<{ reference: string }> {
  void amountCents;
  void metadata;
  if (confirmationTokenId === DECLINED_TEST_TOKEN) {
    throw new PaymentDeclinedError('Tu tarjeta ha sido rechazada.');
  }
  return { reference: `simulado_${randomUUID()}` };
}

// Cobra lo bloqueado con authorize.
export async function capture(reference: string): Promise<void> {
  void reference;
}

// Suelta el bloqueo sin cobrar nada.
export async function release(reference: string): Promise<void> {
  void reference;
}

// Devuelve lo cobrado: todo o, si se indica, solo amountCents.
export async function refund(
  reference: string,
  amountCents?: number,
): Promise<void> {
  void reference;
  void amountCents;
}
