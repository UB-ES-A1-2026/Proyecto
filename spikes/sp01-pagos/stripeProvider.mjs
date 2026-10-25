// SP-01 (#90) · Adaptador de Stripe (modo test) para el mismo contrato PaymentProvider.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// ⚠ ESCRITO PERO NO EJECUTADO en el spike: el equipo aún no tiene cuenta de Stripe ni claves de prueba.
// Cómo probarlo: ver «Probar el adaptador de Stripe» en el README (`npm install` + `.env` con una clave sk_test_…).
//
// Diseño: dos PaymentIntents con `capture_method: 'manual'` por reserva:
//   1. Alquiler + entrega: se confirma con el método de pago del usuario y se guarda la tarjeta (setup_future_usage).
//   2. Fianza: se autoriza con la tarjeta guardada (off_session) y solo se captura si hace falta.
// En la app real, el frontend crea el método de pago con Stripe.js (Payment Element) y envía solo su id `pm_…`;
// el número de la tarjeta nunca pasa por nuestro backend.
import Stripe from 'stripe';
import { PaymentError } from './paymentProvider.mjs';

/** @implements {import('./paymentProvider.mjs').PaymentProvider} */
export class StripePaymentProvider {
  #stripe;

  /** @param {{ secretKey: string }} config */
  constructor({ secretKey }) {
    // Cinturón de seguridad: este adaptador solo se usa en modo test (repo público, coste 0).
    if (!secretKey?.startsWith('sk_test_')) throw new Error('STRIPE_SECRET_KEY debe ser una clave de prueba (sk_test_…).');
    this.#stripe = new Stripe(secretKey);
  }

  async authorize({ paymentId, rentCents, depositCents, paymentMethod }, { idempotencyKey = `${paymentId}:autorizar` } = {}) {
    try {
      const customer = await this.#stripe.customers.create(
        { metadata: { pago_id: paymentId } },
        { idempotencyKey: `${idempotencyKey}:cliente` },
      );
      const rent = await this.#stripe.paymentIntents.create(
        {
          amount: rentCents,
          currency: 'eur',
          customer: customer.id,
          payment_method: paymentMethod,
          payment_method_types: ['card'], // solo tarjeta: admite captura manual y no exige return_url
          capture_method: 'manual',
          setup_future_usage: 'off_session', // para poder autorizar la fianza con la misma tarjeta
          confirm: true,
          metadata: { pago_id: paymentId, concepto: 'alquiler+entrega' },
        },
        { idempotencyKey: `${idempotencyKey}:alquiler` },
      );
      if (rent.status === 'requires_action') {
        // 3D Secure: el frontend tendría que completar la autenticación (stripe.handleNextAction). Fuera del alcance del spike.
        await this.#stripe.paymentIntents.cancel(rent.id);
        return { ok: false, code: 'authentication_required', message: 'La tarjeta pide autenticación (3D Secure).' };
      }
      let deposit;
      try {
        deposit = await this.#stripe.paymentIntents.create(
          {
            amount: depositCents,
            currency: 'eur',
            customer: customer.id,
            payment_method: rent.payment_method,
            payment_method_types: ['card'],
            capture_method: 'manual',
            off_session: true,
            confirm: true,
            expand: ['latest_charge'],
            metadata: { pago_id: paymentId, concepto: 'fianza' },
          },
          { idempotencyKey: `${idempotencyKey}:fianza` },
        );
      } catch (error) {
        await this.#stripe.paymentIntents.cancel(rent.id); // sin fianza no hay pago: se anula también el alquiler
        throw error;
      }
      // Plazo real de la retención según la red de la tarjeta (7 días en general; menos en Visa iniciada por el comercio).
      const captureBefore = deposit.latest_charge?.payment_method_details?.card?.capture_before;
      if (!captureBefore) throw new PaymentError('unexpected_response', 'Stripe no ha devuelto capture_before.');
      return { ok: true, rentRef: rent.id, depositRef: deposit.id, depositHeldUntil: new Date(captureBefore * 1000) };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeCardError) {
        return { ok: false, code: error.decline_code ?? error.code ?? 'card_declined', message: this.#declineMessage(error) };
      }
      throw this.#toPaymentError(error);
    }
  }

  async captureRent(rentRef, { idempotencyKey = `${rentRef}:capturar` } = {}) {
    await this.#call(() => this.#stripe.paymentIntents.capture(rentRef, {}, { idempotencyKey }));
  }

  async secureDeposit(depositRef, { idempotencyKey = `${depositRef}:asegurar` } = {}) {
    await this.#call(() => this.#stripe.paymentIntents.capture(depositRef, {}, { idempotencyKey }));
  }

  async releaseDeposit(depositRef, { idempotencyKey = `${depositRef}:liberar` } = {}) {
    const intent = await this.#call(() => this.#stripe.paymentIntents.retrieve(depositRef, { expand: ['latest_charge'] }));
    if (intent.status === 'requires_capture') {
      await this.#call(() => this.#stripe.paymentIntents.cancel(depositRef, {}, { idempotencyKey }));
    } else if (intent.status === 'succeeded') {
      const pending = intent.amount_received - (intent.latest_charge?.amount_refunded ?? 0);
      if (pending > 0) {
        await this.#call(() => this.#stripe.refunds.create({ payment_intent: depositRef, amount: pending }, { idempotencyKey }));
      }
    }
  }

  async executeDeposit(depositRef, amountCents, { idempotencyKey = `${depositRef}:ejecutar` } = {}) {
    const intent = await this.#call(() => this.#stripe.paymentIntents.retrieve(depositRef, { expand: ['latest_charge'] }));
    if (intent.status === 'requires_capture') {
      // Captura parcial: Stripe libera automáticamente el resto de la autorización.
      await this.#call(() => this.#stripe.paymentIntents.capture(depositRef, { amount_to_capture: amountCents }, { idempotencyKey }));
    } else if (intent.status === 'succeeded') {
      const available = intent.amount_received - (intent.latest_charge?.amount_refunded ?? 0);
      if (amountCents > available) throw new PaymentError('amount_too_large', `Solo quedan ${available} céntimos de fianza.`);
      if (available > amountCents) {
        await this.#call(() => this.#stripe.refunds.create({ payment_intent: depositRef, amount: available - amountCents }, { idempotencyKey }));
      }
    } else {
      throw new PaymentError('authorization_expired', 'La fianza ya no está retenida (autorización anulada o caducada).');
    }
  }

  async refund(rentRef, amountCents, { idempotencyKey = `${rentRef}:reembolsar:${amountCents}` } = {}) {
    await this.#call(() => this.#stripe.refunds.create({ payment_intent: rentRef, amount: amountCents }, { idempotencyKey }));
  }

  async #call(fn) {
    try {
      return await fn();
    } catch (error) {
      throw this.#toPaymentError(error);
    }
  }

  #toPaymentError(error) {
    if (error instanceof PaymentError) return error;
    if (error instanceof Stripe.errors.StripeError) {
      // Algunos códigos de Stripe: payment_intent_unexpected_state (p. ej. capturar dos veces), idempotency_key_in_use…
      return new PaymentError(error.code ?? 'stripe_error', error.message);
    }
    return error;
  }

  #declineMessage(error) {
    if (error.decline_code === 'insufficient_funds') return 'La tarjeta no tiene fondos suficientes.';
    return 'La tarjeta ha sido rechazada. Prueba con otra tarjeta.';
  }
}
