// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { describe, expect, it } from 'vitest';
import {
  availableSlots,
  DELIVERY_SLOTS,
} from '../../src/services/deliverySlots.js';

describe('availableSlots', () => {
  it('offers the six 2-hour slots from 09:00 to 21:00', () => {
    expect(DELIVERY_SLOTS).toEqual([
      '09:00-11:00',
      '11:00-13:00',
      '13:00-15:00',
      '15:00-17:00',
      '17:00-19:00',
      '19:00-21:00',
    ]);
  });

  it('offers all of them when the rental does not start today', () => {
    expect(availableSlots(false, new Date('2026-11-11T18:00:00Z'))).toEqual([
      ...DELIVERY_SLOTS,
    ]);
  });

  it('removes the slots that have already started, in Madrid time', () => {
    // 12:30 en Madrid (UTC+1 en noviembre): quedan las que empiezan a partir de las 13:00.
    expect(availableSlots(true, new Date('2026-11-11T11:30:00Z'))).toEqual([
      '13:00-15:00',
      '15:00-17:00',
      '17:00-19:00',
      '19:00-21:00',
    ]);
  });

  it('uses summer time too', () => {
    // 10:30 en Madrid (UTC+2 en julio).
    expect(availableSlots(true, new Date('2026-07-10T08:30:00Z'))).toEqual(
      DELIVERY_SLOTS.slice(1),
    );
  });

  it('removes a slot at the exact minute it starts', () => {
    expect(availableSlots(true, new Date('2026-11-11T10:00:00Z'))).toEqual(
      DELIVERY_SLOTS.slice(2),
    );
  });

  it('offers nothing late in the evening or all of them early in the morning', () => {
    expect(availableSlots(true, new Date('2026-11-11T20:00:00Z'))).toEqual([]);
    expect(availableSlots(true, new Date('2026-11-11T05:00:00Z'))).toEqual([
      ...DELIVERY_SLOTS,
    ]);
  });
});
