// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 14/11/2026
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  authorize,
  capture,
  DECLINED_TEST_TOKEN,
  PaymentDeclinedError,
  refund,
  release,
  toCents,
} from '../../src/services/paymentGateway.js';

describe('pasarela de pago simulada (US-07.01, #284)', () => {
  it('pasa los importes a céntimos enteros sin errores de coma flotante', () => {
    expect(toCents(new Prisma.Decimal('15.00'))).toBe(1500);
    expect(toCents(new Prisma.Decimal('0.10'))).toBe(10);
    expect(toCents(new Prisma.Decimal('19.99'))).toBe(1999);
    expect(toCents(new Prisma.Decimal('1234567.89'))).toBe(123456789);
  });

  it('bloquea el importe y devuelve una referencia distinta cada vez', async () => {
    const first = await authorize(1500, 'ctoken_ok', { reservationId: 'r1' });
    const second = await authorize(1500, 'ctoken_ok', { reservationId: 'r2' });

    expect(first.reference).toMatch(/^simulado_/);
    expect(second.reference).not.toBe(first.reference);
  });

  it('rechaza el token de tarjeta rechazada con PaymentDeclinedError', async () => {
    await expect(authorize(1500, DECLINED_TEST_TOKEN, {})).rejects.toThrow(
      PaymentDeclinedError,
    );
  });

  it('cobra, libera y reembolsa sin errores', async () => {
    const { reference } = await authorize(1500, 'ctoken_ok', {});

    await expect(capture(reference)).resolves.toBeUndefined();
    await expect(release(reference)).resolves.toBeUndefined();
    await expect(refund(reference)).resolves.toBeUndefined();
    await expect(refund(reference, 500)).resolves.toBeUndefined();
  });
});
