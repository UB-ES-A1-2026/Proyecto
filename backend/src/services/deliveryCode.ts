// Código de entrega con rider (US-05.02, #288): 6 cifras de un solo uso que solo ve el
// arrendatario. Se genera con node:crypto, como los tokens de sesión, para que no se pueda adivinar.
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026
import { randomInt } from 'node:crypto';

export const MAX_CODE_ATTEMPTS = 5;

export function generateDeliveryCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
