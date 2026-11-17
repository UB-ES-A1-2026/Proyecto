// Pasarela de pago (US-07.01, #72). Con STRIPE_SECRET_KEY usa Stripe en modo de prueba (T10, #285);
// sin ella, la pasarela simulada (local, tests, CI y demo). Authorize bloquea un importe sin
// cobrarlo (PaymentIntent con capture_method: manual), capture lo cobra, release suelta el bloqueo
// y refund devuelve lo cobrado. Los importes van siempre en céntimos enteros, en euros.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import Stripe from 'stripe';
import { env } from '../config/env.js';
import {
  simulatedPaymentGateway,
  SIMULATED_3DS_PREFIX,
  SIMULATED_PREFIX,
} from './simulatedPaymentGateway.js';
import { createStripePaymentGateway } from './stripePaymentGateway.js';
import type { PaymentGateway } from './paymentGatewayTypes.js';

export {
  PaymentActionRequiredError,
  PaymentDeclinedError,
  PaymentGatewayError,
  toCents,
  type AuthorizationInfo,
  type PaymentGateway,
} from './paymentGatewayTypes.js';
export {
  DECLINED_TEST_TOKEN,
  THREE_DS_TEST_TOKEN,
} from './simulatedPaymentGateway.js';

export function createPaymentGateway(
  stripeSecretKey: string | undefined,
): PaymentGateway {
  return stripeSecretKey
    ? createStripePaymentGateway(new Stripe(stripeSecretKey))
    : simulatedPaymentGateway;
}

const gateway = createPaymentGateway(env.stripeSecretKey);
const stripeActive = Boolean(env.stripeSecretKey);

// La pasarela la decide solo la configuración. Las referencias «simulado_…» guardadas en la BD
// (seed de demo o pagos hechos sin clave) no existen en Stripe: con Stripe activo son un no-op.
// Esto solo vale para referencias leídas de la BD, nunca para lo que llega en la petición.
function isStoredSimulatedReference(reference: string): boolean {
  return stripeActive && reference.startsWith(SIMULATED_PREFIX);
}

// Forma que debe tener el paymentIntentId que manda el cliente en el segundo paso del 3D Secure.
export function isValidPaymentIntentId(id: string): boolean {
  return stripeActive
    ? /^pi_[A-Za-z0-9]{8,80}$/.test(id)
    : id.startsWith(SIMULATED_3DS_PREFIX);
}

// Bloquea el importe en la tarjeta del usuario. Devuelve la referencia del bloqueo (el id del
// PaymentIntent) o lanza PaymentDeclinedError (rechazo) o PaymentActionRequiredError (3D Secure).
export function authorize(
  amountCents: number,
  confirmationTokenId: string,
  metadata: Record<string, string>,
): Promise<{ reference: string }> {
  return gateway.authorize(amountCents, confirmationTokenId, metadata);
}

// Segundo paso de 3D Secure: estado del PaymentIntent que el navegador acaba de verificar.
export function getAuthorization(paymentIntentId: string) {
  return gateway.getAuthorization(paymentIntentId);
}

// Cobra lo bloqueado con authorize.
export function capture(reference: string): Promise<void> {
  if (isStoredSimulatedReference(reference)) {
    return Promise.resolve();
  }
  return gateway.capture(reference);
}

// Suelta el bloqueo sin cobrar nada.
export function release(reference: string): Promise<void> {
  if (isStoredSimulatedReference(reference)) {
    return Promise.resolve();
  }
  return gateway.release(reference);
}

// Devuelve lo cobrado: todo o, si se indica, solo amountCents.
export function refund(reference: string, amountCents?: number): Promise<void> {
  if (isStoredSimulatedReference(reference)) {
    return Promise.resolve();
  }
  return gateway.refund(reference, amountCents);
}

// Fianza con la tarjeta guardada del alquiler: la bloquea (capture: false) o la cobra (true).
export function authorizeDeposit(
  rentalReference: string,
  amountCents: number,
  options: { capture: boolean },
): Promise<{ reference: string }> {
  if (isStoredSimulatedReference(rentalReference)) {
    return simulatedPaymentGateway.authorizeDeposit(
      rentalReference,
      amountCents,
      options,
    );
  }
  return gateway.authorizeDeposit(rentalReference, amountCents, options);
}
