// Tipos y errores comunes de la pasarela de pago (US-07.01, T10 #285).
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import type { Prisma } from '@prisma/client';

export class PaymentDeclinedError extends Error {}

// El banco pide verificar el pago (3D Secure): el navegador debe llamar a
// stripe.handleNextAction({ clientSecret }) y repetir la solicitud con paymentIntentId.
export class PaymentActionRequiredError extends Error {
  constructor(
    readonly clientSecret: string,
    readonly paymentIntentId: string,
  ) {
    super('Tu banco pide verificar el pago.');
  }
}

// Fallo de la pasarela que no es un rechazo del banco (red, configuración, Stripe caído).
export class PaymentGatewayError extends Error {}

// Estado de un bloqueo ya hecho, para comprobarlo en el segundo paso de 3D Secure.
export interface AuthorizationInfo {
  reference: string;
  status: 'requires_capture' | 'requires_action' | 'other';
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
}

export interface PaymentGateway {
  authorize(
    amountCents: number,
    confirmationTokenId: string,
    metadata: Record<string, string>,
  ): Promise<{ reference: string }>;
  getAuthorization(paymentIntentId: string): Promise<AuthorizationInfo>;
  capture(reference: string): Promise<void>;
  release(reference: string): Promise<void>;
  refund(reference: string, amountCents?: number): Promise<void>;
  authorizeDeposit(
    rentalReference: string,
    amountCents: number,
    options: { capture: boolean },
  ): Promise<{ reference: string }>;
}

// Importe de la BD (DECIMAL(10,2)) a céntimos enteros, sin pasar por coma flotante.
export function toCents(amount: Prisma.Decimal): number {
  return amount.times(100).toDecimalPlaces(0).toNumber();
}
