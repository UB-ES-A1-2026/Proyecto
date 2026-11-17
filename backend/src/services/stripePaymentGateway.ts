// Pasarela de Stripe en modo de prueba (US-07.01, T10 #285). Es el único fichero que importa
// 'stripe'. Nunca se registran tarjetas, tokens, client secrets ni cabeceras.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import Stripe from 'stripe';
import {
  PaymentActionRequiredError,
  PaymentDeclinedError,
  PaymentGatewayError,
  type PaymentGateway,
} from './paymentGatewayTypes.js';

const CURRENCY = 'eur';

const DECLINE_MESSAGES: Record<string, string> = {
  insufficient_funds: 'Tu tarjeta no tiene fondos suficientes.',
  expired_card: 'Tu tarjeta ha caducado.',
  incorrect_cvc: 'El código de seguridad de la tarjeta no es correcto.',
  incorrect_number: 'El número de la tarjeta no es correcto.',
  authentication_required: 'Tu banco pide verificar el pago.',
};
const DEFAULT_DECLINE_MESSAGE = 'Tu tarjeta ha sido rechazada.';

// Errores de tarjeta de Stripe a PaymentDeclinedError con un mensaje en español; el resto, a
// PaymentGatewayError sin datos sensibles.
function translateError(error: unknown): Error {
  if (error instanceof Stripe.errors.StripeCardError) {
    const key = error.decline_code ?? error.code ?? '';
    return new PaymentDeclinedError(
      DECLINE_MESSAGES[error.code ?? ''] ??
        DECLINE_MESSAGES[key] ??
        DEFAULT_DECLINE_MESSAGE,
    );
  }
  if (error instanceof Stripe.errors.StripeError) {
    return new PaymentGatewayError(
      `Error de Stripe (${error.type}${error.code ? `, ${error.code}` : ''})`,
    );
  }
  return error instanceof Error ? error : new PaymentGatewayError('Error');
}

function toAuthorizationStatus(
  status: string,
): 'requires_capture' | 'requires_action' | 'other' {
  return status === 'requires_capture' || status === 'requires_action'
    ? status
    : 'other';
}

function stringOrNull(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  return typeof value === 'string' ? value : value.id;
}

export function createStripePaymentGateway(client: Stripe): PaymentGateway {
  return {
    async authorize(amountCents, confirmationTokenId, metadata) {
      try {
        // Un cliente por solicitud (sin cambios en la BD): guarda la tarjeta para la fianza.
        const customer = await client.customers.create({ metadata });
        const intent = await client.paymentIntents.create({
          amount: amountCents,
          currency: CURRENCY,
          capture_method: 'manual',
          confirm: true,
          confirmation_token: confirmationTokenId,
          customer: customer.id,
          setup_future_usage: 'off_session',
          use_stripe_sdk: true,
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never',
          },
          metadata,
        });

        if (intent.status === 'requires_capture') {
          return { reference: intent.id };
        }
        if (intent.status === 'requires_action' && intent.client_secret) {
          throw new PaymentActionRequiredError(intent.client_secret, intent.id);
        }
        await client.paymentIntents.cancel(intent.id).catch(() => undefined);
        throw new PaymentDeclinedError(DEFAULT_DECLINE_MESSAGE);
      } catch (error) {
        if (
          error instanceof PaymentActionRequiredError ||
          error instanceof PaymentDeclinedError
        ) {
          throw error;
        }
        throw translateError(error);
      }
    },

    async getAuthorization(paymentIntentId) {
      try {
        const intent = await client.paymentIntents.retrieve(paymentIntentId);
        return {
          reference: intent.id,
          status: toAuthorizationStatus(intent.status),
          amountCents: intent.amount,
          currency: intent.currency,
          metadata: { ...intent.metadata },
        };
      } catch (error) {
        throw translateError(error);
      }
    },

    // Cobrar un PaymentIntent que ya está cobrado cuenta como éxito: el commit de la BD pudo fallar
    // después de llamar a Stripe y el reintento vuelve a llamar.
    async capture(reference) {
      try {
        await client.paymentIntents.capture(reference);
      } catch (error) {
        const intent = await client.paymentIntents
          .retrieve(reference)
          .catch(() => null);
        if (intent?.status === 'succeeded') {
          return;
        }
        throw translateError(error);
      }
    },

    // Igual: soltar un bloqueo que ya está cancelado cuenta como éxito.
    async release(reference) {
      try {
        await client.paymentIntents.cancel(reference);
      } catch (error) {
        const intent = await client.paymentIntents
          .retrieve(reference)
          .catch(() => null);
        if (intent?.status === 'canceled') {
          return;
        }
        throw translateError(error);
      }
    },

    async refund(reference, amountCents) {
      try {
        await client.refunds.create({
          payment_intent: reference,
          ...(amountCents === undefined ? {} : { amount: amountCents }),
        });
      } catch (error) {
        throw translateError(error);
      }
    },

    // Fianza fuera de sesión con la tarjeta guardada del alquiler: bloqueo (manual) o cobro.
    async authorizeDeposit(rentalReference, amountCents, options) {
      try {
        const rental = await client.paymentIntents.retrieve(rentalReference);
        const customer = stringOrNull(rental.customer);
        const paymentMethod = stringOrNull(rental.payment_method);
        if (!customer || !paymentMethod) {
          throw new PaymentGatewayError(
            'El alquiler no tiene una tarjeta guardada.',
          );
        }
        const intent = await client.paymentIntents.create(
          {
            amount: amountCents,
            currency: CURRENCY,
            customer,
            payment_method: paymentMethod,
            off_session: true,
            confirm: true,
            capture_method: options.capture ? 'automatic' : 'manual',
            metadata: { ...rental.metadata, type: 'deposit' },
          },
          { idempotencyKey: `deposit_${rentalReference}` },
        );
        const expected = options.capture ? 'succeeded' : 'requires_capture';
        if (intent.status !== expected) {
          await client.paymentIntents.cancel(intent.id).catch(() => undefined);
          throw new PaymentDeclinedError(DEFAULT_DECLINE_MESSAGE);
        }
        return { reference: intent.id };
      } catch (error) {
        if (
          error instanceof PaymentDeclinedError ||
          error instanceof PaymentGatewayError
        ) {
          throw error;
        }
        throw translateError(error);
      }
    },
  };
}
