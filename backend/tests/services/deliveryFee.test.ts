// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { describe, expect, it } from 'vitest';
import {
  quoteRiderFee,
  riderFeeForDistance,
} from '../../src/services/deliveryFee.js';

describe('riderFeeForDistance', () => {
  it.each([
    [0, '3.00'],
    [1.9, '3.00'],
    [2, '3.00'],
    [2.01, '5.00'],
    [5, '5.00'],
    [5.01, '7.00'],
    [20, '7.00'],
  ])('charges %s km as %s', (km, fee) => {
    expect(riderFeeForDistance(km)).toBe(fee);
  });
});

describe('quoteRiderFee', () => {
  it('uses the first tier inside the same neighborhood', () => {
    expect(quoteRiderFee('Gràcia', 'Gràcia')).toEqual({
      distanceKm: 0,
      fee: '3.00',
    });
  });

  it('rounds the distance to one decimal and picks the tier of the real distance', () => {
    expect(quoteRiderFee('Sants', 'Poblenou')).toEqual({
      distanceKm: 7.9,
      fee: '7.00',
    });
  });

  it('charges the middle tier between 2 and 5 km', () => {
    expect(quoteRiderFee('Gràcia', 'Poblenou')).toEqual({
      distanceKm: 4.7,
      fee: '5.00',
    });
  });

  it('charges the lowest tier up to 2 km', () => {
    expect(quoteRiderFee('Gràcia', 'El Coll')).toEqual({
      distanceKm: 1.9,
      fee: '3.00',
    });
  });

  it('applies the highest tier when the item neighborhood is not in the list', () => {
    expect(quoteRiderFee('Vila de Gràcia', 'Gràcia')).toEqual({
      distanceKm: null,
      fee: '7.00',
    });
  });
});
