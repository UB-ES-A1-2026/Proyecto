// Pasarela de Stripe en modo de prueba (US-07.01, T10 #285). Es el único fichero que importa
// 'stripe'. Nunca se registran tarjetas, tokens, client secrets ni cabeceras.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import Stripe from 'stripe';
import {
  PaymentActionRequiredError,
  PaymentDeclinedError,
  PaymentGatewayError,
  PaymentNotFoundError,
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
          // Igual que allowedPaymentMethodTypes del Payment Element: solo tarjeta (sin redirecciones).
          allowed_payment_method_types: ['card'],
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
        if (
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.code === 'resource_missing'
        ) {
          throw new PaymentNotFoundError('El PaymentIntent no existe.');
        }
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

    // Idempotente: el reembolso se hace dentro de una transacción de BD y, si Stripe devuelve el
    // dinero pero falla el commit, el reintento no debe devolverlo otra vez. Dos defensas: una
    // clave de idempotencia determinista y, antes de crear, buscar un reembolso igual ya hecho.
    async refund(reference, amountCents) {
      try {
        const existing = await client.refunds.list({
          payment_intent: reference,
          limit: 100,
        });
        const active = existing.data.filter(
          (refund) =>
            refund.status === 'succeeded' || refund.status === 'pending',
        );
        if (amountCents === undefined) {
          const intent = await client.paymentIntents.retrieve(reference);
          const refunded = active.reduce(
            (sum, refund) => sum + refund.amount,
            0,
          );
          if (
            active.length > 0 &&
            refunded >= (intent.amount_received ?? intent.amount)
          ) {
            return;
          }
        } else if (active.some((refund) => refund.amount === amountCents)) {
          return;
        }

        await client.refunds.create(
          {
            payment_intent: reference,
            ...(amountCents === undefined ? {} : { amount: amountCents }),
          },
          { idempotencyKey: `refund_${reference}_${amountCents ?? 'full'}` },
        );
      } catch (error) {
        throw translateError(error);
      }
    },

    // Limitaciones: la clave de idempotencia solo vale 24 h en Stripe, así que un reintento
    // pasado ese plazo crearía otro PaymentIntent. Y si Stripe cobra o bloquea pero después falla
    // saveDeposit (BD caída), la fianza queda «pendiente» en la BD y la siguiente lectura repite
    // la llamada: dentro de las 24 h la clave devuelve el mismo PaymentIntent y no se duplica;
    // pasado ese plazo habría una fianza duplicada (en modo de prueba, sin dinero real).
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
