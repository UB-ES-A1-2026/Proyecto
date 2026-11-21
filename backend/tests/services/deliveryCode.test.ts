import { describe, expect, it } from 'vitest';
import { generateDeliveryCode } from '../../src/services/deliveryCode.js';

// Código de entrega (US-05.02, #288).
// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 18/11/2026
describe('generateDeliveryCode', () => {
  it('always returns 6 digits, also when the number is small', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateDeliveryCode()).toMatch(/^[0-9]{6}$/);
    }
  });

  it('does not repeat the same code every time', () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateDeliveryCode()),
    );
    expect(codes.size).toBeGreaterThan(1);
  });
});
