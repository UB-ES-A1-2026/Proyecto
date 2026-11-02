import { describe, expect, it } from 'vitest';
import {
  countRentalDays,
  todayInSpain,
} from '../../src/services/reservationService.js';

// Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026

function utc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

describe('countRentalDays', () => {
  it('counts the first and the last day', () => {
    expect(countRentalDays(utc('2026-12-04'), utc('2026-12-06'))).toBe(3);
  });

  it('counts one day when both dates are the same', () => {
    expect(countRentalDays(utc('2026-12-04'), utc('2026-12-04'))).toBe(1);
  });

  it('is not affected by the daylight saving change in Spain', () => {
    expect(countRentalDays(utc('2026-10-24'), utc('2026-10-26'))).toBe(3);
  });
});

describe('todayInSpain', () => {
  it('uses the date in Spain, not the one in UTC', () => {
    // 23:30 en UTC del 3 de diciembre son las 00:30 del 4 en España (UTC+1).
    expect(todayInSpain(new Date('2026-12-03T23:30:00.000Z'))).toBe(
      '2026-12-04',
    );
  });

  it('takes summer time into account', () => {
    // 22:30 en UTC del 3 de julio son las 00:30 del 4 en España (UTC+2).
    expect(todayInSpain(new Date('2026-07-03T22:30:00.000Z'))).toBe(
      '2026-07-04',
    );
  });
});
