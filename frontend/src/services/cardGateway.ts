// Generado con asistencia de IA (Claude)
//
// Convierte los datos de la tarjeta en un método de pago de Stripe (US-07.01, #286).
//
// PROVISIONAL hasta T10 (#285): cuando el backend tenga Stripe en modo de prueba, esta función se
// sustituye por `stripe.createPaymentMethod` con Stripe Elements, y los datos de la tarjeta irán
// directamente del navegador a Stripe. Hasta entonces solo se aceptan las tarjetas de prueba de
// Stripe y se devuelven los ids de prueba que entiende la pasarela provisional del backend.
// En ningún caso se envía el número de la tarjeta a nuestro servidor.

export type CardDetails = {
  number: string;
  expiry: string;
  cvc: string;
};

export type CardField = keyof CardDetails;

export type CardResult =
  { ok: true; paymentMethodId: string } | { ok: false; errors: Partial<Record<CardField, string>> };

export const TEST_CARDS = [
  { number: '4242 4242 4242 4242', result: 'se acepta', paymentMethodId: 'pm_card_visa' },
  {
    number: '4000 0000 0000 0002',
    result: 'se rechaza',
    paymentMethodId: 'pm_card_chargeDeclined',
  },
] as const;

export const CARD_ERRORS = {
  number: 'Introduce un número de tarjeta válido.',
  testOnly: 'Estamos en modo de prueba: usa una de las tarjetas de prueba de abajo.',
  expiry: 'Introduce una fecha de caducidad válida (MM/AA).',
  expired: 'La tarjeta está caducada.',
  cvc: 'Introduce el CVC de 3 o 4 cifras.',
} as const;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

// «4242424242424242» → «4242 4242 4242 4242», mientras se escribe.
export function formatCardNumber(value: string): string {
  return digitsOnly(value)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

// «1228» → «12/28», mientras se escribe.
export function formatExpiry(value: string): string {
  const digits = digitsOnly(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

// Algoritmo de Luhn: descarta errores al teclear el número.
function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function expiryError(expiry: string, today: Date): string | undefined {
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry.trim());
  if (!match) return CARD_ERRORS.expiry;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return CARD_ERRORS.expiry;
  // Vale hasta el último día de su mes.
  const firstDayAfterExpiry = new Date(year, month, 1);
  return firstDayAfterExpiry <= today ? CARD_ERRORS.expired : undefined;
}

export function createPaymentMethod(card: CardDetails, today = new Date()): CardResult {
  const errors: Partial<Record<CardField, string>> = {};
  const number = digitsOnly(card.number);

  if (number.length < 13 || number.length > 19 || !passesLuhn(number)) {
    errors.number = CARD_ERRORS.number;
  }
  const expiry = expiryError(card.expiry, today);
  if (expiry) errors.expiry = expiry;
  if (!/^\d{3,4}$/.test(card.cvc.trim())) errors.cvc = CARD_ERRORS.cvc;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const testCard = TEST_CARDS.find((candidate) => digitsOnly(candidate.number) === number);
  if (!testCard) return { ok: false, errors: { number: CARD_ERRORS.testOnly } };

  return { ok: true, paymentMethodId: testCard.paymentMethodId };
}
