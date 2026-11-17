// Pasarela simulada (local sin clave de Stripe, tests, CI y demo). Mismas firmas que la de Stripe.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import { randomUUID } from 'node:crypto';
import {
  PaymentActionRequiredError,
  PaymentDeclinedError,
  type AuthorizationInfo,
  type PaymentGateway,
} from './paymentGatewayTypes.js';

// Este token se rechaza como una tarjeta sin fondos; cualquier otro se acepta.
export const DECLINED_TEST_TOKEN = 'ctoken_declined';
// Este token simula que el banco pide verificación (3D Secure) antes de bloquear el importe.
export const THREE_DS_TEST_TOKEN = 'ctoken_3ds';

export const SIMULATED_PREFIX = 'simulado_';
export const SIMULATED_3DS_PREFIX = 'simulado_3ds_';

// Autorizaciones pendientes de verificar (3D Secure), en memoria del proceso. Nunca se fía de lo que
// manda el cliente: el importe y los metadatos salen de aquí. Si el servidor se reinicia entre los
// dos pasos, el segundo falla y el usuario repite la solicitud (solo pasa en local o en demo).
const pendingAuthorizations = new Map<
  string,
  { amountCents: number; metadata: Record<string, string> }
>();

export const simulatedPaymentGateway: PaymentGateway = {
  async authorize(amountCents, confirmationTokenId, metadata) {
    if (confirmationTokenId === DECLINED_TEST_TOKEN) {
      throw new PaymentDeclinedError('Tu tarjeta ha sido rechazada.');
    }
    if (confirmationTokenId === THREE_DS_TEST_TOKEN) {
      const intentId = `${SIMULATED_3DS_PREFIX}${randomUUID()}`;
      pendingAuthorizations.set(intentId, { amountCents, metadata });
      throw new PaymentActionRequiredError(
        `simulado_secret_${randomUUID()}`,
        intentId,
      );
    }
    return { reference: `${SIMULATED_PREFIX}${randomUUID()}` };
  },

  async getAuthorization(paymentIntentId): Promise<AuthorizationInfo> {
    const pending = pendingAuthorizations.get(paymentIntentId);
    if (!pending) {
      // Desconocido (inventado o ya liberado): no coincidirá con ninguna solicitud.
      return {
        reference: paymentIntentId,
        status: 'other',
        amountCents: 0,
        currency: 'eur',
        metadata: {},
      };
    }
    return {
      reference: paymentIntentId,
      status: 'requires_capture',
      ...pending,
      currency: 'eur',
    };
  },

  async capture() {},
  async release(reference) {
    pendingAuthorizations.delete(reference);
  },
  async refund() {},

  async authorizeDeposit() {
    return { reference: `${SIMULATED_PREFIX}fianza_${randomUUID()}` };
  },
};
