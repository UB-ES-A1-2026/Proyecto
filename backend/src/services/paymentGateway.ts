// Pasarela de pago (US-07.01). Provisional hasta T10 (#285), que la conecta a Stripe en modo
// de prueba. Usa los ids de las tarjetas de prueba de Stripe para que el cambio sea directo:
// pm_card_visa se acepta y pm_card_chargeDeclined se rechaza.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 11/11/2026
import { randomUUID } from 'node:crypto';

export type ChargeResult =
  | { ok: true; reference: string }
  | { ok: false; message: string };

export async function chargeAndHoldDeposit(input: {
  paymentMethodId: string;
  amountToCharge: number;
  depositToHold: number;
}): Promise<ChargeResult> {
  if (input.paymentMethodId === 'pm_card_chargeDeclined') {
    return { ok: false, message: 'Tu tarjeta ha sido rechazada.' };
  }
  return { ok: true, reference: `simulado_${randomUUID()}` };
}
