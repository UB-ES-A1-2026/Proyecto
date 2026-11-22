// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026
import { describe, expect, it } from 'vitest';
import {
  INVALID_DETAILS_MESSAGE,
  INVALID_REASON_MESSAGE,
  parseWithdrawalBody,
} from '../../src/services/adminItemWithdrawService.js';

describe('parseWithdrawalBody', () => {
  it('acepta los cuatro motivos', () => {
    for (const reason of ['scam', 'prohibited', 'misleading'] as const) {
      expect(parseWithdrawalBody({ reason })).toEqual({
        reason,
        details: null,
      });
    }
    expect(parseWithdrawalBody({ reason: 'other', details: ' x ' })).toEqual({
      reason: 'other',
      details: 'x',
    });
  });

  it.each([undefined, null, 'otro', 3, [], { reason: {} }])(
    'rechaza el cuerpo %j por el motivo',
    (body) => {
      expect(() => parseWithdrawalBody(body)).toThrowError(
        INVALID_REASON_MESSAGE,
      );
    },
  );

  it('rechaza detalles que no son texto, demasiado largos o vacíos con «otro»', () => {
    for (const body of [
      { reason: 'scam', details: 1 },
      { reason: 'scam', details: 'x'.repeat(501) },
      { reason: 'other' },
      { reason: 'other', details: '  ' },
    ]) {
      expect(() => parseWithdrawalBody(body)).toThrowError(
        INVALID_DETAILS_MESSAGE,
      );
    }
  });
});
