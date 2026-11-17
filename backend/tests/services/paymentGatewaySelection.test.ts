// Elección de la pasarela y pasarela simulada con 3D Secure (US-07.01, T10 #285).
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import { describe, expect, it } from 'vitest';
import {
  authorize,
  createPaymentGateway,
  getAuthorization,
  isValidPaymentIntentId,
  PaymentActionRequiredError,
  PaymentNotFoundError,
  THREE_DS_TEST_TOKEN,
} from '../../src/services/paymentGateway.js';
import { parseStripeSecretKey } from '../../src/config/env.js';
import { simulatedPaymentGateway } from '../../src/services/simulatedPaymentGateway.js';

describe('elección de la pasarela', () => {
  it('sin STRIPE_SECRET_KEY usa la simulada', () => {
    expect(createPaymentGateway(undefined)).toBe(simulatedPaymentGateway);
  });

  it('con STRIPE_SECRET_KEY usa Stripe', () => {
    expect(createPaymentGateway('sk_test_fake')).not.toBe(
      simulatedPaymentGateway,
    );
  });

  it('solo admite claves de prueba', () => {
    expect(parseStripeSecretKey(undefined)).toBeUndefined();
    expect(parseStripeSecretKey('  ')).toBeUndefined();
    expect(parseStripeSecretKey('sk_test_abc')).toBe('sk_test_abc');
    expect(() => parseStripeSecretKey('sk_live_abc')).toThrow(/prueba/);
  });
});

describe('3D Secure simulado', () => {
  async function startThreeDs(amount = 1500, metadata = { renterId: 'r1' }) {
    const error = await authorize(amount, THREE_DS_TEST_TOKEN, metadata).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PaymentActionRequiredError);
    return error as PaymentActionRequiredError;
  }

  it('pide verificación y el segundo paso devuelve lo que guardó el servidor', async () => {
    const pending = await startThreeDs();

    expect(pending.clientSecret).toMatch(/^simulado_secret_/);
    await expect(getAuthorization(pending.paymentIntentId)).resolves.toEqual({
      reference: pending.paymentIntentId,
      status: 'requires_capture',
      amountCents: 1500,
      currency: 'eur',
      metadata: { renterId: 'r1' },
    });
    expect(isValidPaymentIntentId(pending.paymentIntentId)).toBe(true);
  });

  it('no acepta un id inventado ni con el importe codificado por el cliente', async () => {
    const forged = `simulado_3ds_${Buffer.from(JSON.stringify({ amountCents: 1, metadata: {} })).toString('base64url')}`;

    await expect(getAuthorization(forged)).rejects.toThrow(
      PaymentNotFoundError,
    );
  });
});
