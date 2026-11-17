// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useEffect, type RefObject } from 'react';
import { getStripePromise } from '../services/stripeService';

// Lo que RentalRequest necesita del formulario de Stripe al pulsar «Enviar solicitud».
export type StripeConfirmer = {
  // elements.submit() + stripe.createConfirmationToken({ elements }).
  createToken(): Promise<{ confirmationTokenId: string } | { error: string }>;
  // stripe.handleNextAction({ clientSecret }): ventana de verificación del banco (3D Secure).
  handleNextAction(clientSecret: string): Promise<{ error?: string }>;
};

const DEFAULT_ERROR = 'No se ha podido procesar el pago. Inténtalo de nuevo.';

type StripePaymentProps = {
  // Total que se bloquea (alquiler + entrega), en céntimos.
  amountCents: number;
  disabled: boolean;
  confirmerRef: RefObject<StripeConfirmer | null>;
};

// Payment Element en modo deferred intent (el PaymentIntent lo crea el backend al enviar): tarjeta y,
// con HTTPS, Apple Pay y Google Pay. Los datos van del navegador a Stripe, nunca a Rentit.
export function StripePayment({ amountCents, disabled, confirmerRef }: StripePaymentProps) {
  return (
    <Elements
      key={amountCents}
      stripe={getStripePromise()}
      options={{
        mode: 'payment',
        amount: amountCents,
        currency: 'eur',
        captureMethod: 'manual',
        setupFutureUsage: 'off_session',
        locale: 'es',
      }}
    >
      <PaymentElementWithConfirmer disabled={disabled} confirmerRef={confirmerRef} />
    </Elements>
  );
}

function PaymentElementWithConfirmer({
  disabled,
  confirmerRef,
}: Pick<StripePaymentProps, 'disabled' | 'confirmerRef'>) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    if (!stripe || !elements) {
      confirmerRef.current = null;
      return;
    }
    confirmerRef.current = {
      async createToken() {
        const submitted = await elements.submit();
        if (submitted.error) return { error: submitted.error.message ?? DEFAULT_ERROR };
        const result = await stripe.createConfirmationToken({ elements });
        if (result.error) return { error: result.error.message ?? DEFAULT_ERROR };
        return { confirmationTokenId: result.confirmationToken.id };
      },
      async handleNextAction(clientSecret) {
        const result = await stripe.handleNextAction({ clientSecret });
        return result.error ? { error: result.error.message ?? DEFAULT_ERROR } : {};
      },
    };
    return () => {
      confirmerRef.current = null;
    };
  }, [stripe, elements, confirmerRef]);

  return <PaymentElement options={{ readOnly: disabled }} />;
}
