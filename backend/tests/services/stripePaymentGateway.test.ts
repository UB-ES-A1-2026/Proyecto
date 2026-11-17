// Pasarela de Stripe con el cliente simulado (sin red ni claves). US-07.01, T10 #285.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { createStripePaymentGateway } from '../../src/services/stripePaymentGateway.js';
import {
  PaymentActionRequiredError,
  PaymentDeclinedError,
  PaymentGatewayError,
} from '../../src/services/paymentGatewayTypes.js';

function fakeClient() {
  const client = {
    customers: { create: vi.fn().mockResolvedValue({ id: 'cus_1' }) },
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
      capture: vi.fn(),
      cancel: vi.fn(),
    },
    refunds: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    client,
    gateway: createStripePaymentGateway(client as unknown as Stripe),
  };
}

function cardError(
  code: string,
  declineCode?: string,
): Stripe.errors.StripeCardError {
  return new Stripe.errors.StripeCardError({
    type: 'card_error',
    code,
    decline_code: declineCode,
    message: 'raw',
  } as never);
}

describe('authorize', () => {
  it('crea y confirma un PaymentIntent de captura manual con la tarjeta guardada', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.create.mockResolvedValue({
      id: 'pi_1',
      status: 'requires_capture',
    });

    const result = await gateway.authorize(1550, 'ctoken_1', { itemId: 'i' });

    expect(result).toEqual({ reference: 'pi_1' });
    expect(client.customers.create).toHaveBeenCalledWith({
      metadata: { itemId: 'i' },
    });
    expect(client.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1550,
        currency: 'eur',
        capture_method: 'manual',
        confirm: true,
        confirmation_token: 'ctoken_1',
        customer: 'cus_1',
        setup_future_usage: 'off_session',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { itemId: 'i' },
      }),
    );
  });

  it('lanza PaymentActionRequiredError con el clientSecret si el banco pide 3D Secure', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.create.mockResolvedValue({
      id: 'pi_2',
      status: 'requires_action',
      client_secret: 'pi_2_secret_x',
    });

    const error = await gateway
      .authorize(100, 't', {})
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentActionRequiredError);
    expect(error).toMatchObject({
      clientSecret: 'pi_2_secret_x',
      paymentIntentId: 'pi_2',
    });
  });

  it('traduce un rechazo de la tarjeta a PaymentDeclinedError en español', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.create.mockRejectedValue(
      cardError('card_declined', 'insufficient_funds'),
    );

    await expect(gateway.authorize(100, 't', {})).rejects.toThrow(
      PaymentDeclinedError,
    );
    await expect(gateway.authorize(100, 't', {})).rejects.toThrow(
      /no tiene fondos/,
    );
  });

  it('un fallo que no es de la tarjeta es un PaymentGatewayError sin datos sensibles', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.create.mockRejectedValue(
      new Stripe.errors.StripeConnectionError({
        type: 'api_connection_error',
        message: 'sk_test_secreto',
      } as never),
    );

    const error = await gateway
      .authorize(100, 't', {})
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentGatewayError);
    expect((error as Error).message).not.toContain('sk_test_secreto');
  });
});

describe('getAuthorization', () => {
  it('devuelve importe, moneda, estado y metadatos del PaymentIntent', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_3',
      status: 'requires_capture',
      amount: 900,
      currency: 'eur',
      metadata: { renterId: 'r' },
    });

    await expect(gateway.getAuthorization('pi_3')).resolves.toEqual({
      reference: 'pi_3',
      status: 'requires_capture',
      amountCents: 900,
      currency: 'eur',
      metadata: { renterId: 'r' },
    });
  });
});

describe('capture, release y refund', () => {
  it('capture cobra el PaymentIntent', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.capture.mockResolvedValue({});
    await gateway.capture('pi_1');
    expect(client.paymentIntents.capture).toHaveBeenCalledWith('pi_1');
  });

  it('capture sobre un PaymentIntent ya succeeded cuenta como éxito', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.capture.mockRejectedValue(new Error('ya cobrado'));
    client.paymentIntents.retrieve.mockResolvedValue({ status: 'succeeded' });

    await expect(gateway.capture('pi_1')).resolves.toBeUndefined();
  });

  it('capture falla si el PaymentIntent no está cobrado', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.capture.mockRejectedValue(new Error('caducado'));
    client.paymentIntents.retrieve.mockResolvedValue({ status: 'canceled' });

    await expect(gateway.capture('pi_1')).rejects.toThrow();
  });

  it('release cancela el PaymentIntent', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.cancel.mockResolvedValue({});
    await gateway.release('pi_1');
    expect(client.paymentIntents.cancel).toHaveBeenCalledWith('pi_1');
  });

  it('release sobre un PaymentIntent ya canceled cuenta como éxito', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.cancel.mockRejectedValue(new Error('ya cancelado'));
    client.paymentIntents.retrieve.mockResolvedValue({ status: 'canceled' });

    await expect(gateway.release('pi_1')).resolves.toBeUndefined();
  });

  it('release falla si el PaymentIntent no está cancelado', async () => {
    const { client, gateway } = fakeClient();
    client.paymentIntents.cancel.mockRejectedValue(new Error('ya cobrado'));
    client.paymentIntents.retrieve.mockResolvedValue({ status: 'succeeded' });

    await expect(gateway.release('pi_1')).rejects.toThrow();
  });

  it('refund devuelve todo o solo la parte indicada, en céntimos', async () => {
    const { client, gateway } = fakeClient();
    await gateway.refund('pi_1');
    await gateway.refund('pi_1', 250);
    expect(client.refunds.create).toHaveBeenNthCalledWith(1, {
      payment_intent: 'pi_1',
    });
    expect(client.refunds.create).toHaveBeenNthCalledWith(2, {
      payment_intent: 'pi_1',
      amount: 250,
    });
  });
});

describe('authorizeDeposit', () => {
  function withRental(client: ReturnType<typeof fakeClient>['client']) {
    client.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_rent',
      customer: 'cus_1',
      payment_method: 'pm_1',
      metadata: { itemId: 'i' },
    });
  }

  it('bloquea la fianza fuera de sesión con la tarjeta guardada (captura manual)', async () => {
    const { client, gateway } = fakeClient();
    withRental(client);
    client.paymentIntents.create.mockResolvedValue({
      id: 'pi_dep',
      status: 'requires_capture',
    });

    await expect(
      gateway.authorizeDeposit('pi_rent', 3000, { capture: false }),
    ).resolves.toEqual({
      reference: 'pi_dep',
    });
    expect(client.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 3000,
        currency: 'eur',
        customer: 'cus_1',
        payment_method: 'pm_1',
        off_session: true,
        confirm: true,
        capture_method: 'manual',
      }),
      { idempotencyKey: 'deposit_pi_rent' },
    );
  });

  it('cobra la fianza (captura automática) en alquileres largos', async () => {
    const { client, gateway } = fakeClient();
    withRental(client);
    client.paymentIntents.create.mockResolvedValue({
      id: 'pi_dep',
      status: 'succeeded',
    });

    await gateway.authorizeDeposit('pi_rent', 3000, { capture: true });

    expect(client.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ capture_method: 'automatic' }),
      expect.anything(),
    );
  });

  it('si el banco pide autenticación fuera de sesión, es un rechazo', async () => {
    const { client, gateway } = fakeClient();
    withRental(client);
    client.paymentIntents.create.mockRejectedValue(
      cardError('authentication_required'),
    );

    await expect(
      gateway.authorizeDeposit('pi_rent', 3000, { capture: false }),
    ).rejects.toThrow(PaymentDeclinedError);
  });
});
