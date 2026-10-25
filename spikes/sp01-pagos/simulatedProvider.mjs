// SP-01 (#90) · Pasarela de pago SIMULADA que reproduce las reglas de Stripe (PaymentIntent con captura manual).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// Reglas copiadas de Stripe (ver «Fuentes» en el ADR 0003):
//   - Una autorización sin capturar caduca a los 7 días (pago con tarjeta en línea) y pasa a `canceled`.
//   - Solo se puede capturar UNA vez; una captura parcial libera automáticamente el resto.
//   - No se puede reembolsar más de lo cobrado.
//   - Idempotencia: la misma clave devuelve la misma respuesta; la misma clave con otros parámetros es un error.
// El estado vive en `store` e `idempotency` (Map por defecto). En el backend deben guardarse en la BD, porque
// Render gratuito se duerme y reinicia el proceso: un Map en memoria se perdería entre el pago y la devolución.
import { randomUUID } from 'node:crypto';
import { PaymentError, TEST_PAYMENT_METHODS } from './paymentProvider.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
export const HOLD_WINDOW_MS = 7 * DAY_MS;

/** @implements {import('./paymentProvider.mjs').PaymentProvider} */
export class SimulatedPaymentProvider {
  #store;
  #idempotency;
  #clock;
  #holdWindowMs;

  constructor({ store = new Map(), idempotency = new Map(), clock = () => new Date(), holdWindowMs = HOLD_WINDOW_MS } = {}) {
    this.#store = store;
    this.#idempotency = idempotency;
    this.#clock = clock;
    this.#holdWindowMs = holdWindowMs;
  }

  async authorize({ paymentId, rentCents, depositCents, paymentMethod }, { idempotencyKey = `${paymentId}:autorizar` } = {}) {
    return this.#once(idempotencyKey, { op: 'authorize', paymentId, rentCents, depositCents, paymentMethod }, () => {
      const testMethod = TEST_PAYMENT_METHODS[paymentMethod];
      if (!testMethod) throw new PaymentError('invalid_payment_method', `Método de pago desconocido: ${paymentMethod}`);
      if (testMethod.declineCode) return { ok: false, code: testMethod.declineCode, message: testMethod.message };
      const rent = this.#createIntent('alquiler', rentCents);
      const deposit = this.#createIntent('fianza', depositCents);
      return { ok: true, rentRef: rent.id, depositRef: deposit.id, depositHeldUntil: new Date(deposit.captureBefore) };
    });
  }

  async captureRent(rentRef, { idempotencyKey = `${rentRef}:capturar` } = {}) {
    return this.#once(idempotencyKey, { op: 'captureRent', rentRef }, () => this.#capture(rentRef));
  }

  async secureDeposit(depositRef, { idempotencyKey = `${depositRef}:asegurar` } = {}) {
    return this.#once(idempotencyKey, { op: 'secureDeposit', depositRef }, () => this.#capture(depositRef));
  }

  async releaseDeposit(depositRef, { idempotencyKey = `${depositRef}:liberar` } = {}) {
    return this.#once(idempotencyKey, { op: 'releaseDeposit', depositRef }, () => {
      const intent = this.#load(depositRef);
      if (intent.status === 'requires_capture') return this.#cancel(depositRef);
      if (intent.status === 'succeeded') return this.#refund(depositRef, intent.captured - intent.refunded);
      return { ...intent }; // ya anulada o caducada: no queda nada retenido
    });
  }

  async executeDeposit(depositRef, amountCents, { idempotencyKey = `${depositRef}:ejecutar` } = {}) {
    return this.#once(idempotencyKey, { op: 'executeDeposit', depositRef, amountCents }, () => {
      const intent = this.#load(depositRef);
      // Autorizada: captura parcial (Stripe libera el resto). Ya cobrada: se reembolsa la diferencia.
      if (intent.status === 'requires_capture') return this.#capture(depositRef, amountCents);
      if (intent.status === 'succeeded') {
        const available = intent.captured - intent.refunded;
        if (amountCents > available) throw new PaymentError('amount_too_large', `Solo quedan ${available} céntimos de fianza.`);
        return available === amountCents ? { ...intent } : this.#refund(depositRef, available - amountCents);
      }
      throw new PaymentError('authorization_expired', 'La fianza ya no está retenida (autorización anulada o caducada).');
    });
  }

  async refund(rentRef, amountCents, { idempotencyKey = `${rentRef}:reembolsar:${amountCents}` } = {}) {
    return this.#once(idempotencyKey, { op: 'refund', rentRef, amountCents }, () => this.#refund(rentRef, amountCents));
  }

  /** Solo para el prototipo y los tests: ver el estado de un intento de pago como lo vería el panel de Stripe. */
  inspect(ref) {
    return { ...this.#load(ref) };
  }

  // ----- Reglas internas (las de un PaymentIntent de Stripe con capture_method: manual) -----

  #createIntent(kind, amount) {
    if (!Number.isInteger(amount) || amount <= 0) throw new PaymentError('invalid_amount', 'El importe debe ser un número entero de céntimos mayor que 0.');
    const now = this.#clock().getTime();
    const intent = {
      id: `sim_pi_${randomUUID()}`,
      kind,
      amount,
      captured: 0,
      refunded: 0,
      status: 'requires_capture',
      createdAt: now,
      captureBefore: now + this.#holdWindowMs,
    };
    this.#store.set(intent.id, intent);
    return intent;
  }

  #load(ref) {
    const intent = this.#store.get(ref);
    if (!intent) throw new PaymentError('not_found', `No existe el pago ${ref}.`);
    if (intent.status === 'requires_capture' && this.#clock().getTime() >= intent.captureBefore) {
      intent.status = 'canceled'; // como Stripe: la autorización caduca y los fondos se liberan solos
      intent.cancellationReason = 'expired';
      this.#store.set(ref, intent);
    }
    return intent;
  }

  #capture(ref, amountCents) {
    const intent = this.#load(ref);
    if (intent.status === 'succeeded') throw new PaymentError('already_captured', 'Este pago ya se capturó; solo se puede capturar una vez.');
    if (intent.status === 'canceled') {
      throw intent.cancellationReason === 'expired'
        ? new PaymentError('authorization_expired', 'La autorización ha caducado: los fondos ya se han liberado.')
        : new PaymentError('invalid_state', 'La autorización está anulada.');
    }
    const amount = amountCents ?? intent.amount;
    if (amount > intent.amount) throw new PaymentError('amount_too_large', `No se pueden capturar ${amount} céntimos de ${intent.amount}.`);
    intent.captured = amount; // el resto (intent.amount - amount) queda liberado
    intent.status = 'succeeded';
    this.#store.set(ref, intent);
    return { ...intent };
  }

  #cancel(ref) {
    const intent = this.#load(ref);
    if (intent.status !== 'requires_capture') throw new PaymentError('invalid_state', `No se puede anular un pago en estado ${intent.status}.`);
    intent.status = 'canceled';
    intent.cancellationReason = 'requested';
    this.#store.set(ref, intent);
    return { ...intent };
  }

  #refund(ref, amountCents) {
    const intent = this.#load(ref);
    if (intent.status !== 'succeeded') throw new PaymentError('invalid_state', 'Solo se puede reembolsar un pago cobrado.');
    if (amountCents > intent.captured - intent.refunded) {
      throw new PaymentError('amount_too_large', `No se pueden reembolsar ${amountCents} céntimos: quedan ${intent.captured - intent.refunded}.`);
    }
    intent.refunded += amountCents;
    this.#store.set(ref, intent);
    return { ...intent };
  }

  // Idempotencia como la de Stripe: se guarda la primera respuesta (o el error de negocio) de cada clave.
  async #once(key, params, fn) {
    const fingerprint = JSON.stringify(params);
    const saved = this.#idempotency.get(key);
    if (saved) {
      if (saved.fingerprint !== fingerprint) {
        throw new PaymentError('idempotency_key_reused', `La clave «${key}» ya se usó con otros parámetros.`);
      }
      if (saved.error) throw saved.error;
      return saved.result;
    }
    try {
      const result = fn();
      this.#idempotency.set(key, { fingerprint, result });
      return result;
    } catch (error) {
      if (error instanceof PaymentError) this.#idempotency.set(key, { fingerprint, error });
      throw error;
    }
  }
}
