// SP-01 (#90) · Contrato de la pasarela de pago (PaymentProvider), errores y métodos de pago de prueba.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// En el backend será una interfaz de TypeScript en `backend/src/repositories/paymentGateway.ts`, el único
// fichero que conoce la pasarela (como `photoStorage.ts` en el ADR 0002). Hay dos implementaciones:
//   - SimulatedPaymentProvider (simulatedProvider.mjs): la que se usa en local, en el CI, en los e2e y en la demo.
//   - StripePaymentProvider (stripeProvider.mjs): Stripe en modo test. Escrita pero NO ejecutada en el spike.
// Los importes van siempre en CÉNTIMOS (enteros), nunca en euros con decimales.

/**
 * @typedef {object} AuthorizeInput
 * @property {string} paymentId      id de la fila `pago`
 * @property {number} rentCents      alquiler + entrega, en céntimos
 * @property {number} depositCents   fianza, en céntimos
 * @property {string} paymentMethod  id del método de pago (`pm_card_visa`…); nunca el número de la tarjeta
 *
 * @typedef {{ ok: true, rentRef: string, depositRef: string, depositHeldUntil: Date }
 *         | { ok: false, code: string, message: string }} AuthorizeResult
 *
 * @typedef {{ idempotencyKey?: string }} CallOptions
 *
 * @typedef {object} PaymentProvider
 * @property {(input: AuthorizeInput, options?: CallOptions) => Promise<AuthorizeResult>} authorize
 *   Autoriza (retiene sin cobrar) dos importes: alquiler + entrega, y fianza. Si falla la segunda, anula la primera.
 * @property {(rentRef: string, options?: CallOptions) => Promise<void>} captureRent
 *   Cobra el alquiler + entrega autorizados.
 * @property {(depositRef: string, options?: CallOptions) => Promise<void>} secureDeposit
 *   Cobra la fianza entera para tenerla «en custodia» (alquiler largo o incidencia abierta).
 * @property {(depositRef: string, options?: CallOptions) => Promise<void>} releaseDeposit
 *   Devuelve la fianza: anula la autorización o reembolsa lo que se cobró.
 * @property {(depositRef: string, amountCents: number, options?: CallOptions) => Promise<void>} executeDeposit
 *   Se queda `amountCents` de la fianza (daños) y libera el resto.
 * @property {(rentRef: string, amountCents: number, options?: CallOptions) => Promise<void>} refund
 *   Reembolsa (parte de) el alquiler + entrega cobrados.
 * @property {(ref: string, options?: CallOptions) => Promise<void>} voidPayment
 *   Deshace un pago a medias (revisión de Francesc en #168): anula la autorización o devuelve todo lo cobrado.
 */

export class PaymentError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
  }
}

// Métodos de pago de prueba: los MISMOS ids que los PaymentMethods de prueba de Stripe
// (https://docs.stripe.com/testing), para que la pantalla de pago y los e2e no cambien al pasar a Stripe.
export const TEST_PAYMENT_METHODS = {
  pm_card_visa: { label: 'Visa de prueba 4242 (aprobada)' },
  pm_card_visa_chargeDeclined: {
    label: 'Tarjeta de prueba 0002 (rechazada)',
    declineCode: 'card_declined',
    message: 'La tarjeta ha sido rechazada. Prueba con otra tarjeta.',
  },
  pm_card_visa_chargeDeclinedInsufficientFunds: {
    label: 'Tarjeta de prueba 9995 (sin fondos)',
    declineCode: 'insufficient_funds',
    message: 'La tarjeta no tiene fondos suficientes.',
  },
};
