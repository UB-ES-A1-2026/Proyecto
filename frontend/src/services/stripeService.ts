// Carga de Stripe.js con la clave publicable de prueba (US-07.01, T10 #285). Sin
// VITE_STRIPE_PUBLISHABLE_KEY no se usa Stripe: la tarjeta es el formulario simulado.
// Generado con asistencia de IA (Claude) – revisado por Maxim Jaume, 17/11/2026
import { loadStripe, type Stripe } from '@stripe/stripe-js';

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim();

export function isStripeEnabled(): boolean {
  return Boolean(PUBLISHABLE_KEY);
}

let stripePromise: Promise<Stripe | null> | null = null;

// Se carga una sola vez, la primera vez que se pide.
export function getStripePromise(): Promise<Stripe | null> {
  if (!PUBLISHABLE_KEY) return Promise.resolve(null);
  stripePromise ??= loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}
